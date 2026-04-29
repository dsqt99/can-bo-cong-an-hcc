"""
Streaming Speech-to-Text service using WhisperLiveKit WebSocket.

Connects to a WhisperLiveKit server (Docker container) at /asr endpoint.
WLK provides:
  - Streaming transcription (real-time partial + committed results)
  - Built-in Silero VAD (voice activity detection)
  - Automatic silence detection and segmentation

Protocol:
  Frontend → Backend: audio chunks (binary, webm or PCM)
  Backend → WLK:      raw audio bytes via WebSocket /asr
  WLK → Backend:      JSON messages with {lines, buffer_transcription, ...}
  Backend → Frontend: {type: "transcript", text: "...", isFinal: bool}
"""

import asyncio
import os
import json
import logging
from typing import Optional, Callable, Awaitable

import websockets

logger = logging.getLogger(__name__)


class StreamSTTService:
    """
    Streaming STT service backed by WhisperLiveKit.
    
    Each call to `stream_transcribe` opens a new WS connection to the WLK
    server, streams audio chunks to it, and yields partial transcription 
    results back to the caller.
    """

    def __init__(
        self,
        wlk_ws_url: str = None,
        language: str = "vi",
    ):
        self.wlk_ws_url = wlk_ws_url or os.getenv(
            "WLK_WS_URL", "ws://localhost:8769/asr"
        )
        self.language = language or os.getenv("STT_LANG", "vi")
        logger.info(f"🔧 StreamSTT init: WLK URL={self.wlk_ws_url}, lang={self.language}")

    def _get_connection_url(self) -> str:
        """Build the WLK WebSocket URL with language parameter."""
        url = self.wlk_ws_url
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}language={self.language}"

    async def stream_transcribe(
        self,
        audio_queue: asyncio.Queue,
        on_partial: Optional[Callable[[str, bool], Awaitable[None]]] = None,
        timeout_after_done: float = 5.0,
    ) -> str:
        """
        Stream audio chunks from an asyncio.Queue to WLK and collect results.

        Args:
            audio_queue: Queue of audio bytes. Put b"" or None to signal end.
            on_partial:  async callback(text, is_final) for each update.
            timeout_after_done: seconds to wait for final results after audio ends.

        Returns:
            The final combined transcription text.
        """
        uri = self._get_connection_url()
        final_text = ""
        send_done = asyncio.Event()

        # Retry connection if WLK is still loading model
        ws = None
        max_retries = 10
        for attempt in range(max_retries):
            try:
                ws = await websockets.connect(uri)
                logger.info(f"✅ Connected to WLK STT: {uri}")
                break
            except (ConnectionRefusedError, OSError) as e:
                if attempt < max_retries - 1:
                    wait = 5
                    logger.warning(f"⏳ WLK not ready (attempt {attempt+1}/{max_retries}), retrying in {wait}s...")
                    await asyncio.sleep(wait)
                else:
                    logger.error(f"❌ WLK not reachable after {max_retries} attempts: {e}")
                    raise

        if ws is None:
            raise ConnectionError("Could not connect to WLK STT")

        try:
            # Wait for config message from WLK server
            try:
                config_msg = await asyncio.wait_for(ws.recv(), timeout=5.0)
                config_data = json.loads(config_msg)
                if config_data.get("type") == "config":
                    logger.info(f"📋 WLK config: useAudioWorklet={config_data.get('useAudioWorklet')}")
            except asyncio.TimeoutError:
                logger.warning("⚠️ No config message from WLK, proceeding anyway")
            except Exception as e:
                logger.warning(f"⚠️ Error reading WLK config: {e}")

            async def send_audio():
                """Send audio chunks from queue to WLK."""
                try:
                    while True:
                        chunk = await audio_queue.get()
                        if chunk is None or chunk == b"":
                            # Signal end of audio - send empty blob
                            try:
                                await ws.send(b"")
                            except websockets.exceptions.ConnectionClosed:
                                pass
                            break
                        try:
                            await ws.send(chunk)
                        except websockets.exceptions.ConnectionClosed:
                            logger.info("🔌 WLK WebSocket closed during send")
                            break
                except Exception as e:
                    logger.error(f"❌ Error sending audio to WLK: {e}")
                finally:
                    send_done.set()
                    logger.info("📤 Audio send to WLK complete")

            async def receive_results():
                """Receive streaming transcription from WLK."""
                nonlocal final_text
                try:
                    while True:
                        if send_done.is_set():
                            try:
                                msg = await asyncio.wait_for(
                                    ws.recv(),
                                    timeout=timeout_after_done
                                )
                            except asyncio.TimeoutError:
                                logger.info("⏱️ No more WLK results after audio done")
                                break
                        else:
                            msg = await ws.recv()

                        try:
                            data = json.loads(msg)
                        except json.JSONDecodeError:
                            logger.warning(f"⚠️ Non-JSON from WLK: {msg[:100]}")
                            continue

                        msg_type = data.get("type", "")

                        # Handle ready_to_stop signal
                        if msg_type == "ready_to_stop":
                            logger.info("✅ WLK ready_to_stop received")
                            break

                        # Handle config (shouldn't happen here but just in case)
                        if msg_type == "config":
                            continue

                        # Extract text from WLK response
                        text = self._extract_text(data)
                        status = data.get("status", "active_transcription")

                        if text:
                            final_text = text
                            is_final = send_done.is_set()

                            if on_partial:
                                await on_partial(text, is_final)

                            logger.debug(f"📝 WLK transcript: {text[:80]}...")

                        if status == "no_audio_detected":
                            logger.info("🤫 WLK: no audio detected")

                except websockets.exceptions.ConnectionClosed:
                    logger.info("🔌 WLK connection closed")
                except Exception as e:
                    logger.error(f"❌ Error receiving WLK results: {e}")

            # Run send and receive concurrently
            await asyncio.gather(send_audio(), receive_results())

        except Exception as e:
            logger.error(f"❌ Error in stream_transcribe: {e}")
            raise
        finally:
            try:
                await ws.close()
            except Exception:
                pass

        return final_text

    def _extract_text(self, data: dict) -> str:
        """
        Extract combined transcription text from a WLK FrontData response.
        
        WLK sends:
          - lines: [{speaker, text, start, end}, ...]  (committed text)
          - buffer_transcription: "..."  (uncommitted/partial text)
          - buffer_diarization: "..."  (text pending speaker assignment)
        
        We combine all into a single string.
        """
        parts = []

        # Committed lines
        lines = data.get("lines", [])
        for line in lines:
            text = line.get("text", "")
            speaker = line.get("speaker", 1)
            if text and speaker != -2:  # -2 = silence segment
                parts.append(text.strip())

        # Buffer (uncommitted transcription)
        buffer_trans = data.get("buffer_transcription", "").strip()
        if buffer_trans:
            parts.append(buffer_trans)

        buffer_diar = data.get("buffer_diarization", "").strip()
        if buffer_diar:
            parts.append(buffer_diar)

        return " ".join(parts).strip()

    async def transcribe_audio_bytes(
        self,
        audio_bytes: bytes,
        on_partial: Optional[Callable[[str, bool], Awaitable[None]]] = None,
        chunk_size: int = 8192,
    ) -> str:
        """
        Convenience method: transcribe a complete audio buffer through WLK.

        Args:
            audio_bytes: Complete audio data (WebM, WAV, etc.)
            on_partial: async callback(text, is_final)
            chunk_size: Size of chunks to send

        Returns:
            Final transcription text
        """
        queue = asyncio.Queue()

        async def feed_audio():
            for i in range(0, len(audio_bytes), chunk_size):
                await queue.put(audio_bytes[i:i + chunk_size])
            await queue.put(b"")  # Signal end

        # Start feeding and transcribing concurrently
        feed_task = asyncio.create_task(feed_audio())
        result = await self.stream_transcribe(queue, on_partial=on_partial)
        await feed_task
        return result
