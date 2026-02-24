import asyncio
import logging
import json
import base64
import uuid
import re
from typing import Dict, Any

logger = logging.getLogger(__name__)


class SessionManager:
    """
    Session manager for voice chat:
    - FE records audio with VAD (silence detection) → sends complete blob as base64
    - BE decodes → STT (file-based) → AI → TTS → response
    """

    def __init__(self, websocket, services: Dict[str, Any], settings: Dict[str, Any]):
        self.websocket = websocket
        self.services = services
        self.settings = settings.copy()
        self.session_id = str(uuid.uuid4())

        # TTS stop signal
        self.tts_stop_event = asyncio.Event()

        # WebSocket state
        self._ws_closed = False

        logger.info(f"✅ Session initialized: {self.session_id}")

    # ── WebSocket helpers ──────────────────────────────────────────

    async def _safe_send_json(self, data: dict):
        """Send JSON, silently ignore if connection closed"""
        if self._ws_closed:
            return
        try:
            await self.websocket.send_json(data)
        except Exception as e:
            logger.debug(f"WS send failed: {e}")
            self._ws_closed = True

    # ── Lifecycle ──────────────────────────────────────────────────

    async def start(self):
        await self._safe_send_json({
            "type": "session_init",
            "session_id": self.session_id
        })

    async def cleanup(self):
        self.tts_stop_event.set()

    # ── Message routing ────────────────────────────────────────────

    async def handle_message(self, message):
        if "text" not in message:
            return

        try:
            data = json.loads(message["text"])
            msg_type = data.get("type")

            if msg_type == "update_settings":
                self._handle_update_settings(data.get("settings", {}))

            elif msg_type == "chat_message":
                text = data.get("text", "").strip()
                if text:
                    await self._process_pipeline(text)

            elif msg_type == "audio_complete":
                audio_b64 = data.get("data", "")
                mime_type = data.get("mimeType", "audio/webm")
                if audio_b64:
                    await self._handle_audio(audio_b64, mime_type)

            elif msg_type == "user_speaking":
                self.tts_stop_event.set()

        except json.JSONDecodeError:
            logger.error("Invalid JSON received")

    def _handle_update_settings(self, new_settings):
        self.settings.update(new_settings)
        ai = self.services["ai"]
        stt = self.services["stt"]
        tts = self.services["tts"]

        if "systemPrompt" in new_settings:
            ai.update_prompt(new_settings["systemPrompt"])

        if "aiModel" in new_settings:
            ai.update_model(new_settings["aiModel"])

        if "llmApiUrl" in new_settings and new_settings["llmApiUrl"]:
            ai.base_url = new_settings["llmApiUrl"]
            ai.update_model(ai.model)  # re-init client with new URL

        if "llmApiKey" in new_settings and new_settings["llmApiKey"]:
            ai.api_key = new_settings["llmApiKey"]
            ai.update_model(ai.model)  # re-init client with new key

        if "sttModel" in new_settings and new_settings["sttModel"]:
            stt.model = new_settings["sttModel"]
            logger.info(f"🎤 STT model updated: {stt.model}")

        if "ttsVoice" in new_settings and new_settings["ttsVoice"]:
            tts.default_voice = new_settings["ttsVoice"]
            logger.info(f"🔊 TTS voice updated: {tts.default_voice}")

        logger.info("⚙️ Settings updated")

    # ── Audio → STT → AI → TTS pipeline ───────────────────────────

    async def _handle_audio(self, audio_b64: str, mime_type: str):
        """Decode base64 audio → STT → AI → TTS"""
        logger.info(f"🎤 Received audio ({len(audio_b64)} chars b64)")

        # 1. Decode base64
        try:
            audio_bytes = base64.b64decode(audio_b64)
        except Exception as e:
            logger.error(f"❌ Base64 decode failed: {e}")
            await self._safe_send_json({"type": "stt_error", "message": "Audio decode failed"})
            return

        logger.info(f"📦 Audio: {len(audio_bytes)} bytes ({mime_type})")

        # 2. STT
        await self._safe_send_json({"type": "ai_processing", "isProcessing": True})

        try:
            stt = self.services["stt"]
            transcript = await stt.transcribe(audio_bytes, mime_type)
        except Exception as e:
            logger.error(f"❌ STT error: {e}")
            await self._safe_send_json({"type": "stt_error", "message": str(e)})
            return

        if not transcript:
            logger.warning("⚠️ Empty transcript")
            await self._safe_send_json({
                "type": "transcript",
                "text": "(Không nhận diện được giọng nói)",
                "isFinal": True
            })
            await self._safe_send_json({"type": "ai_processing", "isProcessing": False})
            return

        logger.info(f"📝 Transcript: {transcript}")

        # 3. Send transcript to FE
        await self._safe_send_json({
            "type": "transcript",
            "text": transcript,
            "isFinal": True
        })

        # 4. AI → TTS
        await self._process_pipeline(transcript)

    # ── AI + TTS ───────────────────────────────────────────────────

    async def _process_pipeline(self, input_text: str):
        """Run AI streaming + sentence-level TTS"""
        self.tts_stop_event.clear()
        await self._safe_send_json({"type": "ai_processing", "isProcessing": True})

        ai = self.services["ai"]
        full_response = ""
        emotion = "NEUTRAL"
        sentence_buffer = ""
        clean_so_far = ""

        try:
            async for chunk in ai.process_stream(input_text, session_id=self.session_id):
                if self.tts_stop_event.is_set():
                    break

                full_response += chunk

                # Detect emotion tag
                if emotion == "NEUTRAL" and "[" in full_response and "]" in full_response:
                    tag = re.search(r'\[(.*?)\]', full_response)
                    if tag:
                        emotion = tag.group(1)

                # Stream cleaned text to FE
                display = re.sub(r'\[.*?\]', '', full_response).strip()
                if display and display != clean_so_far:
                    clean_so_far = display
                    await self._safe_send_json({
                        "type": "ai_stream_chunk",
                        "text": clean_so_far
                    })

                # Sentence splitting for TTS
                sentence_buffer += chunk
                sentences = re.split(r'(?<=[.!?])\s+', sentence_buffer)
                if len(sentences) > 1:
                    for s in sentences[:-1]:
                        if s.strip():
                            await self._send_tts(s)
                    sentence_buffer = sentences[-1]

            # Flush remaining buffer
            if sentence_buffer.strip() and not self.tts_stop_event.is_set():
                await self._send_tts(sentence_buffer)

        except Exception as e:
            logger.error(f"❌ AI/TTS pipeline error: {e}")

        # Final AI response
        final_text = re.sub(r'\[.*?\]', '', full_response).strip()
        if final_text:
            await self._safe_send_json({
                "type": "ai_response",
                "text": final_text,
                "emotion": emotion
            })

    async def _send_tts(self, text: str):
        """Generate TTS for a sentence and send audio to FE"""
        if self.tts_stop_event.is_set():
            return

        clean = re.sub(r'\[.*?\]', '', text).strip()
        if not clean:
            return

        try:
            audio = await self.services["tts"].synthesize(
                clean,
                audio_prompt=self.settings.get("ttsAudioPrompt"),
                language=self.settings.get("ttsLanguage", "vi")
            )
            if audio and not self.tts_stop_event.is_set():
                await self._safe_send_json({
                    "type": "audio",
                    "data": base64.b64encode(audio).decode("utf-8")
                })
        except Exception as e:
            logger.error(f"TTS error: {e}")
