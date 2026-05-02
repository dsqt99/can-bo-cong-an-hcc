"""
ElevenLabs Speech-to-Text provider với Realtime WebSocket streaming.

Thay thế WhisperLiveKit bằng ElevenLabs Scribe v2 Realtime API.
Hỗ trợ:
  - Streaming STT qua WebSocket trực tiếp (raw PCM 16-bit, 16kHz, mono)
  - Partial transcripts (kết quả tạm thời) và committed transcripts (kết quả cuối)
  - Manual commit: backend gửi commit sau khi audio kết thúc
  - Interface tương thích với StreamSTTService (stream_transcribe / transcribe_audio_bytes)

Protocol (raw WebSocket — không dùng SDK):
  Endpoint: wss://api.elevenlabs.io/v1/speech-to-text/realtime
            ?model_id=scribe_v2_realtime
            &language_code=vi
            &commit_strategy=manual
  Header:   xi-api-key: <ELEVENLABS_API_KEY>

  Client → Server:
    {"message_type": "input_audio_chunk", "audio_base_64": "<b64>", "sample_rate": 16000}
    {"message_type": "commit"}

  Server → Client:
    {"message_type": "session_started", ...}
    {"message_type": "partial_transcript", "text": "..."}
    {"message_type": "committed_transcript", "text": "..."}
    {"message_type": "error", "error": "..."}

Audio pipeline:
  Browser MediaRecorder (webm/opus, 100ms chunks)
    → Backend thu thập TOÀN BỘ webm stream vào buffer
      → Sau khi audio_stream_stop: convert một lần duy nhất sang PCM 16kHz
        → Gửi PCM qua WebSocket ElevenLabs
          → Nhận transcript

Lý do convert một lần:
  WebM là container format — header (EBML) chỉ có ở chunk ĐẦU TIÊN.
  ffmpeg không thể decode các sub-chunk riêng lẻ, cần toàn bộ stream.
"""

import asyncio
import base64
import io
import json
import logging
import os
import subprocess
import time
from typing import Callable, Optional
from urllib.parse import urlencode

import websockets

logger = logging.getLogger(__name__)

_WS_STT_BASE = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
DEFAULT_MODEL_ID = "scribe_v2_realtime"
DEFAULT_SAMPLE_RATE = 16000
DEFAULT_LANGUAGE = "vi"


def _build_ws_url(model_id: str, language: str, commit_strategy: str = "manual") -> str:
    params = {
        "model_id": model_id,
        "language_code": language,
        "commit_strategy": commit_strategy,
    }
    return f"{_WS_STT_BASE}?{urlencode(params)}"


def _convert_full_webm_to_pcm16(webm_bytes: bytes, sample_rate: int = 16000) -> bytes:
    """
    Convert TOÀN BỘ WebM buffer → raw PCM 16-bit mono.
    Phải là toàn bộ vì WebM header chỉ có ở đầu stream.
    """
    if not webm_bytes:
        return b""
    try:
        proc = subprocess.run(
            [
                "ffmpeg", "-y",
                "-hide_banner", "-loglevel", "error",
                "-i", "pipe:0",
                "-ar", str(sample_rate),
                "-ac", "1",
                "-f", "s16le",
                "pipe:1",
            ],
            input=webm_bytes,
            capture_output=True,
            timeout=30,
        )
        if proc.returncode == 0 and proc.stdout:
            logger.info(f"✅ ffmpeg convert: {len(webm_bytes)} WebM → {len(proc.stdout)} PCM bytes")
            return proc.stdout
        logger.warning(f"ffmpeg exit {proc.returncode}: {proc.stderr[:300]}")
        return b""
    except FileNotFoundError:
        logger.error("❌ ffmpeg không tìm thấy")
        return b""
    except Exception as e:
        logger.error(f"❌ ffmpeg lỗi: {e}")
        return b""


class ElevenLabsSTTService:
    """
    Realtime STT dùng ElevenLabs Scribe v2 WebSocket API.
    Interface tương thích với StreamSTTService.
    """

    def __init__(
        self,
        api_key: str = None,
        model_id: str = DEFAULT_MODEL_ID,
        language: str = DEFAULT_LANGUAGE,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
    ):
        self.api_key = api_key or os.getenv("ELEVENLABS_API_KEY", "")
        self.model_id = model_id or os.getenv("ELEVENLABS_STT_MODEL", DEFAULT_MODEL_ID)
        self.language = language or os.getenv("STT_LANG", "vi")
        self.sample_rate = sample_rate

        if not self.api_key:
            logger.warning("⚠️  ELEVENLABS_API_KEY chưa được cấu hình")
        else:
            logger.info(f"✅ ElevenLabs STT: model={self.model_id}, lang={self.language}")

    async def stream_transcribe_pcm(
        self,
        audio_queue: asyncio.Queue,
        on_partial: Optional[Callable] = None,
        timeout_after_done: float = 2.0,
    ) -> str:
        """Forward PCM16 16kHz mono chunks to ElevenLabs realtime STT as they arrive."""
        if not self.api_key:
            logger.error("❌ Thiếu ELEVENLABS_API_KEY")
            return ""

        t_start = time.time()
        uri = _build_ws_url(self.model_id, self.language, commit_strategy="manual")
        headers = {"xi-api-key": self.api_key}
        final_text = ""
        partial_text = ""
        send_done_event = asyncio.Event()

        try:
            t_ws_start = time.time()
            async with websockets.connect(uri, additional_headers=headers) as ws:
                logger.info(f"✅ ElevenLabs PCM STT WS kết nối: {time.time() - t_ws_start:.2f}s")

                async def _send():
                    total_sent = 0
                    first_chunk_logged = False
                    try:
                        while True:
                            chunk = await audio_queue.get()
                            if chunk is None or chunk == b"":
                                break
                            if not first_chunk_logged:
                                first_chunk_logged = True
                                logger.info(f"⏱️ STT first PCM chunk after {time.time() - t_start:.2f}s")
                            await ws.send(json.dumps({
                                "message_type": "input_audio_chunk",
                                "audio_base_64": base64.b64encode(chunk).decode("utf-8"),
                                "sample_rate": self.sample_rate,
                            }))
                            total_sent += len(chunk)
                        await ws.send(json.dumps({"message_type": "commit"}))
                        logger.info(f"📤 PCM STT sent {total_sent} bytes and commit in {time.time() - t_start:.2f}s")
                    except Exception as e:
                        logger.error(f"❌ PCM STT send lỗi: {e}")
                    finally:
                        send_done_event.set()

                async def _recv():
                    nonlocal final_text, partial_text
                    committed_segments: list[str] = []
                    first_partial_logged = False
                    try:
                        while True:
                            timeout = timeout_after_done if send_done_event.is_set() else 30.0
                            try:
                                msg = await asyncio.wait_for(ws.recv(), timeout=timeout)
                            except asyncio.TimeoutError:
                                break

                            try:
                                data = json.loads(msg)
                            except json.JSONDecodeError:
                                continue

                            msg_type = data.get("message_type", "")
                            text = data.get("text", "").strip()

                            if msg_type == "session_started":
                                logger.info(f"✅ STT session: {data.get('session_id', '')}")
                            elif msg_type == "partial_transcript" and text:
                                partial_text = text
                                if not first_partial_logged:
                                    first_partial_logged = True
                                    logger.info(f"⏱️ STT first partial after {time.time() - t_start:.2f}s")
                                if on_partial:
                                    cb = on_partial(text, False)
                                    if asyncio.iscoroutine(cb):
                                        await cb
                            elif msg_type == "committed_transcript" and text:
                                committed_segments.append(text)
                                logger.info(f"⏱️ STT committed segment after {time.time() - t_start:.2f}s")
                                if on_partial:
                                    cb = on_partial(text, True)
                                    if asyncio.iscoroutine(cb):
                                        await cb
                                if send_done_event.is_set():
                                    break
                            elif msg_type == "error":
                                err = data.get("error", "unknown")
                                logger.error(f"❌ STT API error: {err}")
                                if err not in ("insufficient_audio_activity", "commit_throttled"):
                                    break
                    except websockets.exceptions.ConnectionClosed:
                        logger.info("🔌 ElevenLabs PCM STT WS đóng")

                    if committed_segments:
                        final_text = " ".join(committed_segments)

                await asyncio.gather(_send(), _recv())
        except Exception as e:
            logger.error(f"❌ ElevenLabs PCM STT lỗi: {e}")

        result = final_text or partial_text
        logger.info(f"📝 PCM STT result length={len(result)} total={time.time() - t_start:.2f}s")
        return result

    async def stream_transcribe(
        self,
        audio_queue: asyncio.Queue,
        on_partial: Optional[Callable] = None,
        timeout_after_done: float = 20.0,
    ) -> str:
        """
        Nhận webm chunks từ Queue, thu thập toàn bộ, convert sang PCM,
        gửi lên ElevenLabs Realtime STT, trả transcript.

        Protocol: thu thập buffer hoàn chỉnh → convert một lần → gửi PCM chunks.
        """
        if not self.api_key:
            logger.error("❌ Thiếu ELEVENLABS_API_KEY")
            return ""

        # ── Bước 1: Thu thập toàn bộ webm stream ────────────────────
        t_start = time.time()
        logger.info("🎤 ElevenLabs STT: bắt đầu thu thập audio...")
        webm_chunks: list[bytes] = []
        try:
            while True:
                chunk = await asyncio.wait_for(audio_queue.get(), timeout=30.0)
                if chunk is None or chunk == b"":
                    break
                webm_chunks.append(chunk)
        except asyncio.TimeoutError:
            logger.warning("⏱️ STT: timeout thu thập audio (30s)")

        if not webm_chunks:
            logger.warning("⚠️ STT: không nhận được audio chunk nào")
            return ""

        full_webm = b"".join(webm_chunks)
        t_collect = time.time() - t_start
        logger.info(f"📦 Thu thập xong: {len(full_webm)} bytes WebM ({len(webm_chunks)} chunks) trong {t_collect:.2f}s")

        # ── Bước 2: Convert WebM → PCM 16kHz ────────────────────────
        t_convert_start = time.time()
        loop = asyncio.get_event_loop()
        pcm_data = await loop.run_in_executor(
            None, _convert_full_webm_to_pcm16, full_webm, self.sample_rate
        )
        t_convert = time.time() - t_convert_start
        logger.info(f"⏱️ ffmpeg convert: {t_convert:.2f}s")

        if not pcm_data:
            logger.error("❌ Convert WebM→PCM thất bại — không có audio để gửi")
            return ""

        # ── Bước 3: Gửi lên ElevenLabs + nhận transcript ────────────
        # Dùng commit_strategy="vad" để ElevenLabs VAD tự quyết khi nào final
        uri = _build_ws_url(self.model_id, self.language, commit_strategy="vad")
        headers = {"xi-api-key": self.api_key}

        final_text = ""
        partial_text = ""
        send_done_event = asyncio.Event()

        try:
            t_ws_start = time.time()
            async with websockets.connect(uri, additional_headers=headers) as ws:
                t_ws_connect = time.time() - t_ws_start
                logger.info(f"✅ ElevenLabs STT WS kết nối: {uri} ({t_ws_connect:.2f}s)")

                async def _send():
                    """Gửi toàn bộ PCM. Với auto commit, không cần gửi commit thủ công."""
                    chunk_size = 32000  # 1 giây tại 16kHz s16le mono
                    total_sent = 0
                    try:
                        for i in range(0, len(pcm_data), chunk_size):
                            part = pcm_data[i : i + chunk_size]
                            msg = {
                                "message_type": "input_audio_chunk",
                                "audio_base_64": base64.b64encode(part).decode("utf-8"),
                                "sample_rate": self.sample_rate,
                            }
                            await ws.send(json.dumps(msg))
                            total_sent += len(part)

                        t_send = time.time() - t_ws_start
                        logger.info(f"📤 Đã gửi {total_sent} PCM bytes ({t_send:.2f}s), chờ ElevenLabs VAD auto-commit")
                    except Exception as e:
                        logger.error(f"❌ _send lỗi: {e}")
                    finally:
                        send_done_event.set()

                async def _recv():
                    """Nhận transcript chạy song song với _send.
                    Với auto-commit: ElevenLabs VAD tự quyết khi nào gửi committed_transcript.
                    Tích lũy tất cả segments cho đến khi send xong + timeout.
                    """
                    nonlocal final_text, partial_text
                    committed_segments: list[str] = []
                    try:
                        while True:
                            # Sau khi gửi audio xong, chờ tối đa timeout_after_done giây
                            timeout = timeout_after_done if send_done_event.is_set() else 30.0
                            try:
                                msg = await asyncio.wait_for(ws.recv(), timeout=timeout)
                            except asyncio.TimeoutError:
                                logger.info(f"⏱️ STT recv timeout ({timeout}s) — thu thập xong")
                                break

                            try:
                                data = json.loads(msg)
                            except json.JSONDecodeError:
                                continue

                            msg_type = data.get("message_type", "")
                            text = data.get("text", "").strip()

                            if msg_type == "session_started":
                                logger.info(f"✅ STT session: {data.get('session_id', '')}")

                            elif msg_type == "partial_transcript" and text:
                                partial_text = text
                                logger.info(f"📝 partial: {text[:80]}")
                                if on_partial:
                                    cb = on_partial(text, False)
                                    if asyncio.iscoroutine(cb):
                                        await cb

                            elif msg_type == "committed_transcript" and text:
                                # Auto-commit: tích lũy segment, không break ngay
                                committed_segments.append(text)
                                logger.info(f"✅ committed segment [{len(committed_segments)}]: {text[:80]}")
                                if on_partial:
                                    cb = on_partial(text, True)
                                    if asyncio.iscoroutine(cb):
                                        await cb
                                # Sau khi send xong mà nhận committed → chờ thêm 2s cho segment tiếp theo
                                if send_done_event.is_set():
                                    try:
                                        extra = await asyncio.wait_for(ws.recv(), timeout=2.0)
                                        data2 = json.loads(extra)
                                        if data2.get("message_type") == "committed_transcript":
                                            seg2 = data2.get("text", "").strip()
                                            if seg2:
                                                committed_segments.append(seg2)
                                                logger.info(f"✅ committed segment [{len(committed_segments)}]: {seg2[:80]}")
                                    except asyncio.TimeoutError:
                                        pass  # Không còn segment nữa
                                    break

                            elif msg_type == "committed_transcript_with_timestamps":
                                pass  # Không cần timestamps

                            elif msg_type == "error":
                                err = data.get("error", "unknown")
                                logger.error(f"❌ STT API error: {err}")
                                if err not in ("insufficient_audio_activity", "commit_throttled"):
                                    break

                    except websockets.exceptions.ConnectionClosed:
                        logger.info("🔌 ElevenLabs STT WS đóng")
                    except asyncio.CancelledError:
                        logger.info("🛑 STT recv cancelled")
                    except Exception as e:
                        logger.error(f"❌ STT recv lỗi: {e}")

                    # Ghép tất cả segments thành transcript cuối
                    if committed_segments:
                        final_text = " ".join(committed_segments)

                # Chạy song song thực sự — gather đợi cả hai xong
                await asyncio.gather(_send(), _recv())

        except Exception as e:
            logger.error(f"❌ ElevenLabs STT lỗi: {e}")

        result = final_text or partial_text
        t_total = time.time() - t_start
        if result:
            logger.info(f"📝 STT kết quả: '{result[:100]}' (tổng {t_total:.2f}s)")
        else:
            logger.warning(f"⚠️ STT: không có transcript (tổng {t_total:.2f}s)")
        return result

    async def transcribe_audio_bytes(
        self,
        audio_bytes: bytes,
        on_partial: Optional[Callable] = None,
        chunk_size: int = 8192,
    ) -> str:
        """Transcribe từ buffer hoàn chỉnh. Tương thích StreamSTTService."""
        queue: asyncio.Queue = asyncio.Queue()

        async def _feed():
            for i in range(0, len(audio_bytes), chunk_size):
                await queue.put(audio_bytes[i : i + chunk_size])
            await queue.put(b"")

        feed_task = asyncio.create_task(_feed())
        result = await self.stream_transcribe(queue, on_partial=on_partial)
        await feed_task
        return result

    async def transcribe_batch(self, audio_bytes: bytes, language: str = None) -> str:
        """Batch STT dùng Scribe v2 REST (chính xác hơn, latency cao hơn)."""
        if not self.api_key:
            return ""
        try:
            from elevenlabs import ElevenLabs
            client = ElevenLabs(api_key=self.api_key)
            loop = asyncio.get_event_loop()

            def _call():
                result = client.speech_to_text.convert(
                    file=("audio.webm", io.BytesIO(audio_bytes), "audio/webm"),
                    model_id="scribe_v2",
                    language_code=language or self.language,
                )
                return result.text or ""

            text = await loop.run_in_executor(None, _call)
            logger.info(f"✅ STT batch: '{text[:80]}'")
            return text
        except Exception as e:
            logger.error(f"❌ STT batch lỗi: {e}")
            return ""
