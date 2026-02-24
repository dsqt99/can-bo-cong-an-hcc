import asyncio
import os
import io
import logging
import json
import subprocess
import tempfile
import shutil
from typing import Optional

import websockets
import soundfile as sf
import numpy as np

logger = logging.getLogger(__name__)

# Find ffmpeg executable: system PATH first, then imageio_ffmpeg fallback
FFMPEG_EXE = shutil.which("ffmpeg")
if not FFMPEG_EXE:
    try:
        import imageio_ffmpeg
        FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        pass

HAS_FFMPEG = FFMPEG_EXE is not None
logger.info(f"🔧 FFmpeg available: {HAS_FFMPEG}" + (f" ({FFMPEG_EXE})" if HAS_FFMPEG else " — audio/webm will NOT work!"))


class STTService:
    """
    Speech-to-Text service.
    Accepts audio bytes (WebM/WAV), converts to PCM via ffmpeg if needed,
    then sends to STT WebSocket server for transcription.
    """

    def __init__(
        self,
        ws_url: Optional[str] = None,
        model: str = "large-v3",
        lang: str = "vi",
    ):
        self.ws_url = ws_url or os.getenv("STT_WS_URL", "wss://cahy-stt.anm05.com/stream")
        self.model = model
        self.lang = lang
        logger.info(f"🔧 STT init: ffmpeg={'✅ ' + str(FFMPEG_EXE) if HAS_FFMPEG else '❌ NOT FOUND'}")

    def _get_ws_url(self) -> str:
        return f"{self.ws_url}?model={self.model}&lang={self.lang}"

    async def transcribe(self, audio_bytes: bytes, mime_type: str = "audio/webm") -> str:
        """
        Transcribe audio bytes to text.

        Args:
            audio_bytes: Raw audio data (WebM, WAV, etc.)
            mime_type: MIME type of the audio

        Returns:
            Transcription text (empty string if nothing detected)
        """
        if not audio_bytes:
            return ""

        # Convert to PCM int16 mono 16kHz
        pcm_bytes = await self._to_pcm(audio_bytes, mime_type)
        if not pcm_bytes:
            logger.warning("⚠️ Could not convert audio to PCM")
            return ""

        # Send PCM to STT websocket
        return await self._stt_websocket(pcm_bytes)

    async def _to_pcm(self, audio_bytes: bytes, mime_type: str) -> Optional[bytes]:
        """Convert any audio format to raw PCM int16 mono 16kHz"""

        # If we have ffmpeg, use it (handles WebM, Opus, MP3, etc.)
        if HAS_FFMPEG:
            return await self._ffmpeg_to_pcm(audio_bytes)

        # Fallback: try soundfile (only works with WAV/FLAC/OGG, NOT WebM)
        try:
            audio_io = io.BytesIO(audio_bytes)
            data, sr = sf.read(audio_io, dtype='int16')
            # If stereo, convert to mono
            if data.ndim > 1:
                data = data[:, 0]
            # Resample to 16kHz if needed (simple decimation)
            if sr != 16000:
                ratio = 16000 / sr
                new_len = int(len(data) * ratio)
                indices = np.linspace(0, len(data) - 1, new_len).astype(int)
                data = data[indices]
            return data.tobytes()
        except Exception as e:
            logger.error(f"❌ soundfile fallback failed: {e}")
            return None

    async def _ffmpeg_to_pcm(self, audio_bytes: bytes) -> Optional[bytes]:
        """Use ffmpeg to convert any audio to PCM int16 mono 16kHz.
        Uses temp files instead of pipes for Windows compatibility."""
        tmp_in_path = None
        tmp_out_path = None
        try:
            # Write input audio to temp file
            fd_in, tmp_in_path = tempfile.mkstemp(suffix=".webm")
            os.write(fd_in, audio_bytes)
            os.close(fd_in)

            # Prepare output temp file path
            tmp_out_path = tmp_in_path + ".pcm"

            # Run ffmpeg synchronously in executor (temp files, no pipes)
            loop = asyncio.get_event_loop()
            def _run():
                return subprocess.run(
                    [
                        FFMPEG_EXE,
                        "-hide_banner", "-loglevel", "error",
                        "-y",
                        "-i", tmp_in_path,
                        "-f", "s16le", "-ac", "1", "-ar", "16000",
                        tmp_out_path,
                    ],
                    capture_output=True,
                    timeout=15,
                )

            result = await loop.run_in_executor(None, _run)

            if result.returncode != 0:
                logger.error(f"❌ ffmpeg error: {result.stderr.decode('utf-8', errors='replace')}")
                return None

            if not os.path.exists(tmp_out_path) or os.path.getsize(tmp_out_path) == 0:
                logger.warning("⚠️ ffmpeg returned empty output")
                return None

            with open(tmp_out_path, "rb") as f:
                pcm_data = f.read()

            logger.info(f"✅ ffmpeg converted: {len(audio_bytes)} → {len(pcm_data)} bytes PCM")
            return pcm_data

        except Exception as e:
            logger.error(f"❌ ffmpeg conversion error: {e}")
            return None
        finally:
            # Cleanup temp files
            for p in [tmp_in_path, tmp_out_path]:
                try:
                    if p and os.path.exists(p):
                        os.unlink(p)
                except Exception:
                    pass

    async def _stt_websocket(self, pcm_bytes: bytes) -> str:
        """Send PCM audio to STT WebSocket and get transcript"""
        uri = self._get_ws_url()
        results = []
        CHUNK_SIZE = 8192  # Send in 8KB chunks

        try:
            async with websockets.connect(uri) as ws:
                logger.info(f"✅ Connected to STT: {uri}")

                # Send PCM in chunks
                for i in range(0, len(pcm_bytes), CHUNK_SIZE):
                    chunk = pcm_bytes[i:i + CHUNK_SIZE]
                    await ws.send(chunk)

                    # Non-blocking receive for partial results
                    try:
                        result = await asyncio.wait_for(ws.recv(), timeout=0.01)
                        results.append(result)
                    except asyncio.TimeoutError:
                        pass

                logger.info(f"📤 Sent {len(pcm_bytes)} bytes PCM, waiting for results...")

                # Wait for final results
                try:
                    while True:
                        result = await asyncio.wait_for(ws.recv(), timeout=3.0)
                        results.append(result)
                        logger.info(f"📝 STT result: {result}")
                except asyncio.TimeoutError:
                    pass

        except Exception as e:
            logger.error(f"❌ STT WebSocket error: {e}")

        # Extract text from results
        return self._parse_results(results)

    def _parse_results(self, results: list) -> str:
        """Parse STT results and return the best transcript"""
        texts = []
        for result in results:
            try:
                if isinstance(result, str):
                    # Try JSON parse
                    try:
                        data = json.loads(result)
                        text = data.get("text", "").strip()
                    except (json.JSONDecodeError, TypeError):
                        text = result.strip()
                else:
                    text = str(result).strip()

                if text:
                    texts.append(text)
            except Exception:
                continue

        # Return the last (most complete) result
        return texts[-1] if texts else ""
