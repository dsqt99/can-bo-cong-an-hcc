"""
ElevenLabs Text-to-Speech provider với WebSocket streaming.

Thay thế VieNeu-TTS Gradio API bằng ElevenLabs TTS API.
Hỗ trợ:
  - Streaming theo câu (synthesize / synthesize_stream)
  - WebSocket input-streaming: gửi từng chunk text từ LLM → nhận audio liên tục (ws_stream)
  - Voice ID cố định: A5w1fw5x0uXded1LDvZp
  - Model: eleven_flash_v2_5 (~75ms latency)

Ref: .agents/skills/text-to-speech/SKILL.md
     .agents/skills/text-to-speech/references/streaming.md
"""

import asyncio
import base64
import json
import logging
import os
import re
from typing import AsyncIterator, Optional

import websockets

logger = logging.getLogger(__name__)

# ElevenLabs WebSocket TTS endpoint
_WS_TTS_URL = "wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id={model_id}&output_format={output_format}"

# Mặc định
DEFAULT_VOICE_ID = "A5w1fw5x0uXded1LDvZp"
DEFAULT_MODEL_ID = "eleven_flash_v2_5"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"  # mp3 cho web playback


class ElevenLabsTTSService:
    """
    ElevenLabs TTS service với hai chế độ:

    1. synthesize(text) → bytes
       Gọi REST API, trả toàn bộ audio MP3.

    2. synthesize_stream(text, stop_event) → AsyncIterator[bytes]
       Chia text thành câu, gọi REST từng câu, yield audio chunk.

    3. ws_stream(text_iterator, stop_event) → AsyncIterator[bytes]
       WebSocket streaming: nhận text chunk từ LLM generator,
       gửi vào ElevenLabs WS TTS, nhận audio chunk trả về ngay.
       Đây là chế độ thấp độ trễ nhất cho voice agent.
    """

    def __init__(
        self,
        api_key: str = None,
        voice_id: str = DEFAULT_VOICE_ID,
        model_id: str = DEFAULT_MODEL_ID,
        output_format: str = DEFAULT_OUTPUT_FORMAT,
    ):
        self.api_key = api_key or os.getenv("ELEVENLABS_API_KEY", "")
        self.voice_id = voice_id
        self.model_id = model_id
        self.output_format = output_format

        if not self.api_key:
            logger.warning("⚠️  ELEVENLABS_API_KEY chưa được cấu hình")
        else:
            logger.info(
                f"✅ ElevenLabs TTS khởi tạo: voice={self.voice_id}, model={self.model_id}"
            )

    # ── Internal helpers ────────────────────────────────────────────

    def _clean_text(self, text: str) -> str:
        """Loại bỏ emotion tags, markdown, ký tự đặc biệt."""
        # Strip [EMOTION] tags
        if text.startswith("[") and "]" in text:
            text = text[text.find("]") + 1 :].strip()
        # Strip markdown
        for ch in ["*", "_", "~", "#", "`"]:
            text = text.replace(ch, "")
        return text.strip()

    def _split_into_sentences(self, text: str) -> list[str]:
        """Chia văn bản thành câu cho synthesize_stream."""
        clean = self._clean_text(text)
        if not clean:
            return []
        parts = re.split(r"([.!?。！？]+)", clean)
        sentences = []
        for i in range(0, len(parts) - 1, 2):
            s = (parts[i] + parts[i + 1]).strip()
            if s:
                sentences.append(s)
        if len(parts) % 2 == 1 and parts[-1].strip():
            sentences.append(parts[-1].strip())
        return sentences or [clean]

    # ── REST API (synthesize một câu) ───────────────────────────────

    async def synthesize(self, text: str, **kwargs) -> bytes:
        """
        Tổng hợp giọng nói cho một đoạn text, trả bytes MP3.
        Dùng ElevenLabs REST API (non-streaming).
        """
        clean = self._clean_text(text)
        if not clean:
            return b""

        try:
            from elevenlabs import ElevenLabs

            client = ElevenLabs(api_key=self.api_key)

            loop = asyncio.get_event_loop()

            def _call():
                chunks = client.text_to_speech.convert(
                    text=clean,
                    voice_id=self.voice_id,
                    model_id=self.model_id,
                    output_format=self.output_format,
                )
                return b"".join(chunks)

            audio = await loop.run_in_executor(None, _call)
            logger.info(
                f"🔊 ElevenLabs TTS REST: '{clean[:40]}...' → {len(audio)} bytes"
            )
            return audio

        except Exception as e:
            logger.error(f"❌ ElevenLabs TTS REST lỗi: {e}")
            return b""

    # ── Sentence-level streaming (tương thích cũ) ───────────────────

    async def synthesize_stream(
        self, text: str, stop_event: Optional[asyncio.Event] = None
    ) -> AsyncIterator[bytes]:
        """
        Chia text thành câu, gọi synthesize() từng câu, yield audio chunk.
        Tương thích với interface của TextToSpeechService.synthesize_stream.
        """
        clean = self._clean_text(text)
        if not clean:
            return

        sentences = self._split_into_sentences(clean)
        for sentence in sentences:
            if stop_event and stop_event.is_set():
                logger.info("🛑 ElevenLabs TTS dừng — người dùng đang nói")
                break
            if not sentence.strip():
                continue
            try:
                chunk = await self.synthesize(sentence)
                if chunk:
                    if stop_event and stop_event.is_set():
                        break
                    yield chunk
                    logger.info(
                        f"🔊 ElevenLabs TTS câu chunk: {len(chunk)} bytes"
                    )
            except Exception as e:
                logger.error(f"ElevenLabs TTS lỗi câu '{sentence[:30]}': {e}")

    # ── WebSocket streaming (text-in → audio-out, low latency) ─────

    async def ws_stream(
        self,
        text_iterator,
        stop_event: Optional[asyncio.Event] = None,
    ) -> AsyncIterator[bytes]:
        """
        WebSocket TTS streaming — chế độ thấp độ trễ nhất.

        Nhận text_iterator (async generator hoặc list of str),
        gửi từng chunk vào ElevenLabs WS TTS theo thời gian thực,
        nhận và yield audio MP3 chunk ngay khi có.

        Args:
            text_iterator: async iterable hoặc list trả về các str text chunk.
            stop_event:    nếu được set, dừng gửi và thoát.

        Yields:
            bytes: MP3 audio chunk.
        """
        if not self.api_key:
            logger.error("❌ Chưa có ELEVENLABS_API_KEY")
            return

        uri = _WS_TTS_URL.format(
            voice_id=self.voice_id,
            model_id=self.model_id,
            output_format=self.output_format,
        )

        audio_queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()

        async def _send_text(ws):
            """Gửi text chunks vào WebSocket ElevenLabs."""
            try:
                # Khởi tạo connection
                init_msg = {
                    "text": " ",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.8,
                        "use_speaker_boost": True,
                    },
                    "generation_config": {
                        "chunk_length_schedule": [120, 160, 250, 290]
                    },
                    "xi_api_key": self.api_key,
                }
                await ws.send(json.dumps(init_msg))
                logger.info("📡 ElevenLabs WS TTS: đã gửi init")

                # Gửi text chunks từ iterator
                if hasattr(text_iterator, "__aiter__"):
                    async for chunk in text_iterator:
                        if stop_event and stop_event.is_set():
                            break
                        if chunk and chunk.strip():
                            clean = self._clean_text(chunk)
                            if clean:
                                # flush=True sau mỗi câu để audio ra ngay
                                ends_sentence = bool(
                                    re.search(r"[.!?,;:\n]$", clean)
                                )
                                msg = {"text": clean + " "}
                                if ends_sentence:
                                    msg["flush"] = True
                                await ws.send(json.dumps(msg))
                                logger.debug(
                                    f"📤 WS TTS gửi: '{clean[:40]}'"
                                )
                else:
                    # Synchronous list
                    for chunk in text_iterator:
                        if stop_event and stop_event.is_set():
                            break
                        if chunk and chunk.strip():
                            clean = self._clean_text(chunk)
                            if clean:
                                ends_sentence = bool(
                                    re.search(r"[.!?,;:\n]$", clean)
                                )
                                msg = {"text": clean + " "}
                                if ends_sentence:
                                    msg["flush"] = True
                                await ws.send(json.dumps(msg))

                # Đóng stream (empty string = done)
                await ws.send(json.dumps({"text": ""}))
                logger.info("📤 ElevenLabs WS TTS: đóng text stream")

            except Exception as e:
                logger.error(f"❌ WS TTS send error: {e}")
            finally:
                await audio_queue.put(None)  # Signal: sender done

        async def _recv_audio(ws):
            """Nhận audio chunk từ ElevenLabs WebSocket."""
            try:
                while True:
                    msg = await ws.recv()
                    data = json.loads(msg)
                    if data.get("audio"):
                        raw = base64.b64decode(data["audio"])
                        await audio_queue.put(raw)
                        logger.debug(
                            f"📥 WS TTS nhận audio: {len(raw)} bytes"
                        )
                    if data.get("isFinal"):
                        logger.info("✅ ElevenLabs WS TTS: stream hoàn tất")
                        await audio_queue.put(None)
                        break
            except websockets.exceptions.ConnectionClosed:
                logger.info("🔌 ElevenLabs WS TTS: connection đóng")
                await audio_queue.put(None)
            except Exception as e:
                logger.error(f"❌ WS TTS recv error: {e}")
                await audio_queue.put(None)

        try:
            async with websockets.connect(uri) as ws:
                # Chạy song song send và receive
                send_task = asyncio.create_task(_send_text(ws))
                recv_task = asyncio.create_task(_recv_audio(ws))

                done_count = 0
                while done_count < 2:
                    item = await audio_queue.get()
                    if item is None:
                        done_count += 1
                        continue
                    if stop_event and stop_event.is_set():
                        break
                    yield item

                send_task.cancel()
                recv_task.cancel()

        except Exception as e:
            logger.error(f"❌ ElevenLabs WS TTS connection lỗi: {e}")

    # ── Interface tương thích với TextToSpeechService ───────────────

    def update_voice(self, voice_id: str):
        """Cập nhật voice ID."""
        self.voice_id = voice_id
        logger.info(f"🔊 ElevenLabs TTS voice → {voice_id}")

    def update_speaking_rate(self, rate: float):
        pass  # ElevenLabs speed được set trong VoiceSettings

    def update_tts_engine(self, engine: str):
        pass
