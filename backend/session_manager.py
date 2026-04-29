import asyncio
import logging
import json
import base64
import uuid
import re
import time
from typing import Dict, Any

logger = logging.getLogger(__name__)


class SessionManager:
    """
    Session manager for voice chat with streaming STT via WhisperLiveKit.
    
    Two modes of audio input:
    1. audio_stream: FE streams audio chunks in real-time → BE proxies to WLK → streaming transcription
    2. audio_complete: FE sends complete audio blob → BE sends to WLK → transcription (legacy fallback)
    3. chat_message: FE sends text directly → AI pipeline
    """

    def __init__(self, websocket, services: Dict[str, Any], settings: Dict[str, Any]):
        self.websocket = websocket
        self.services = services
        self.settings = settings.copy()
        self.session_id = str(uuid.uuid4())

        # TTS task management
        self.tts_stop_event = asyncio.Event()
        self.tts_queue = asyncio.Queue(maxsize=5)
        self.tts_worker_task = asyncio.create_task(self._tts_worker())

        # Streaming STT state
        self._stt_audio_queue: asyncio.Queue | None = None
        self._stt_stream_task: asyncio.Task | None = None
        self._last_stt_text = ""

        # WebSocket state
        self._ws_closed = False

        logger.info(f"✅ Session initialized: {self.session_id}")

    async def _tts_worker(self):
        """Sequential background worker for TTS to avoid blocking the AI stream"""
        while not self._ws_closed:
            try:
                text = await self.tts_queue.get()
                if text is None:  # Shutdown signal
                    break
                
                if not self.tts_stop_event.is_set():
                    await self._send_tts_execution(text)
                
                self.tts_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"TTS Worker Error: {e}")
                await asyncio.sleep(0.1)

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
        self._ws_closed = True
        self.tts_stop_event.set()
        
        # Stop any active STT stream
        await self._stop_stt_stream()
        
        if self.tts_worker_task:
            self.tts_worker_task.cancel()

    # ── Message routing ────────────────────────────────────────────

    async def handle_message(self, message):
        if "text" not in message and "bytes" not in message:
            return

        # Handle binary audio chunks for streaming STT
        if "bytes" in message:
            audio_data = message["bytes"]
            if self._stt_audio_queue is not None:
                await self._stt_audio_queue.put(audio_data)
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

            elif msg_type == "new_session":
                self.session_id = str(uuid.uuid4())
                await self._safe_send_json({
                    "type": "session_init",
                    "session_id": self.session_id
                })
                logger.info(f"🔄 Started new chat session: {self.session_id}")

            elif msg_type == "audio_stream_start":
                # FE starts streaming audio → open WLK connection
                await self._start_stt_stream()

            elif msg_type == "audio_stream_stop":
                # FE stops streaming → signal end to WLK
                await self._stop_stt_stream()

            elif msg_type == "audio_chunk":
                # FE sends base64-encoded audio chunk during stream
                audio_b64 = data.get("data", "")
                if audio_b64 and self._stt_audio_queue is not None:
                    audio_bytes = base64.b64decode(audio_b64)
                    await self._stt_audio_queue.put(audio_bytes)

            elif msg_type == "audio_complete":
                # Legacy: FE sends complete audio blob
                audio_b64 = data.get("data", "")
                mime_type = data.get("mimeType", "audio/webm")
                if audio_b64:
                    await self._handle_audio_complete(audio_b64, mime_type)

            elif msg_type == "user_speaking":
                # Clear TTS stop event and pending queue
                self.tts_stop_event.set()
                while not self.tts_queue.empty():
                    try:
                        self.tts_queue.get_nowait()
                        self.tts_queue.task_done()
                    except asyncio.QueueEmpty:
                        break
                # Echo back to FE so it can immediately clear audio queue/playback
                await self._safe_send_json({"type": "user_speaking"})

        except json.JSONDecodeError:
            logger.error("Invalid JSON received")

    def _handle_update_settings(self, new_settings):
        self.settings.update(new_settings)
        ai = self.services["ai"]
        tts = self.services["tts"]

        if "systemPrompt" in new_settings:
            ai.update_prompt(new_settings["systemPrompt"])

        if any(k in new_settings for k in ["aiModel", "llmApiUrl", "llmApiKey"]):
            model = new_settings.get("aiModel", getattr(ai, "model", "chatbot-cahy"))
            url = new_settings.get("llmApiUrl")
            key = new_settings.get("llmApiKey")
            ai.update_all_configs(model=model, url=url, key=key)

        if "sttModel" in new_settings and new_settings["sttModel"]:
            logger.info(f"🎤 STT model setting updated: {new_settings['sttModel']}")

        if "ttsVoice" in new_settings and new_settings["ttsVoice"]:
            if hasattr(tts, "default_voice"):
                tts.default_voice = new_settings["ttsVoice"]
                logger.info(f"🔊 TTS voice updated: {tts.default_voice}")

        if "elevenlabsVoiceId" in new_settings:
            el_tts = self.services.get("elevenlabs_tts")
            if el_tts and hasattr(el_tts, "update_voice"):
                el_tts.update_voice(new_settings["elevenlabsVoiceId"])
                logger.info(f"🔊 ElevenLabs voice ID → {new_settings['elevenlabsVoiceId']}")

        logger.info("⚙️ Settings updated")

    # ── Streaming STT (ElevenLabs) ─────────────────────────────

    async def _start_stt_stream(self):
        """Start streaming STT session with ElevenLabs."""
        logger.info("🎙️ _start_stt_stream begin")
        # Stop any existing stream first
        await self._stop_stt_stream()

        self._last_stt_text = ""
        self._stt_audio_queue = asyncio.Queue()
        
        await self._safe_send_json({"type": "stt_processing", "isProcessing": True})

        async def run_stt_stream():
            try:
                stream_stt = self.services["stream_stt"]
                
                async def on_partial(text: str, is_final: bool):
                    self._last_stt_text = text
                    await self._safe_send_json({
                        "type": "transcript",
                        "text": text,
                        "isFinal": False
                    })

                final_text = await stream_stt.stream_transcribe(
                    self._stt_audio_queue,
                    on_partial=on_partial,
                )

                # Use final_text or last known text
                transcript = final_text or self._last_stt_text

                await self._safe_send_json({"type": "stt_processing", "isProcessing": False})

                if not transcript:
                    logger.warning("⚠️ Empty transcript from WLK stream")
                    await self._safe_send_json({
                        "type": "transcript",
                        "text": "(Không nhận diện được giọng nói)",
                        "isFinal": True
                    })
                    return

                logger.info(f"📝 Stream transcript: {transcript}")

                # Send final transcript
                await self._safe_send_json({
                    "type": "transcript",
                    "text": transcript,
                    "isFinal": True
                })

                # Run AI pipeline
                await self._process_pipeline(transcript)

            except Exception as e:
                logger.error(f"❌ STT stream error: {e}")
                await self._safe_send_json({"type": "stt_processing", "isProcessing": False})
                await self._safe_send_json({"type": "stt_error", "message": str(e)})

        self._stt_stream_task = asyncio.create_task(run_stt_stream())

    async def _stop_stt_stream(self):
        """Signal end of audio stream and wait for STT to finish."""
        if self._stt_audio_queue is not None:
            await self._stt_audio_queue.put(b"")  # Signal end
            self._stt_audio_queue = None

        if self._stt_stream_task is not None:
            try:
                await asyncio.wait_for(self._stt_stream_task, timeout=60.0)
            except asyncio.TimeoutError:
                logger.warning("⏱️ STT stream task timed out, cancelling")
                self._stt_stream_task.cancel()
            except Exception as e:
                logger.error(f"❌ Error stopping STT stream: {e}")
            self._stt_stream_task = None

    # ── Legacy: Complete audio blob → STT ──────────────────────────

    async def _handle_audio_complete(self, audio_b64: str, mime_type: str):
        """Legacy path: decode base64 audio → WLK STT → AI → TTS"""
        logger.info(f"🎤 Received complete audio ({len(audio_b64)} chars b64)")

        try:
            audio_bytes = base64.b64decode(audio_b64)
        except Exception as e:
            logger.error(f"❌ Base64 decode failed: {e}")
            await self._safe_send_json({"type": "stt_error", "message": "Audio decode failed"})
            return

        logger.info(f"📦 Audio: {len(audio_bytes)} bytes ({mime_type})")

        await self._safe_send_json({"type": "stt_processing", "isProcessing": True})

        try:
            stream_stt = self.services["stream_stt"]

            async def on_partial(text: str, is_final: bool):
                await self._safe_send_json({
                    "type": "transcript",
                    "text": text,
                    "isFinal": False
                })

            transcript = await stream_stt.transcribe_audio_bytes(
                audio_bytes, on_partial=on_partial
            )
        except Exception as e:
            logger.error(f"❌ STT error: {e}")
            await self._safe_send_json({"type": "stt_processing", "isProcessing": False})
            await self._safe_send_json({"type": "stt_error", "message": str(e)})
            return
        finally:
            await self._safe_send_json({"type": "stt_processing", "isProcessing": False})

        if not transcript:
            logger.warning("⚠️ Empty transcript")
            await self._safe_send_json({
                "type": "transcript",
                "text": "(Không nhận diện được giọng nói)",
                "isFinal": True
            })
            return

        logger.info(f"📝 Transcript: {transcript}")

        await self._safe_send_json({
            "type": "transcript",
            "text": transcript,
            "isFinal": True
        })

        await self._process_pipeline(transcript)

    # ── AI + TTS ───────────────────────────────────────────────────

    async def _process_pipeline(self, input_text: str):
        """Run RAG Agent streaming + sentence-level TTS"""
        t_pipeline_start = time.time()
        logger.info(f"🤖 RAG pipeline begin: {input_text[:100]}")
        self.tts_stop_event.clear()

        # Clear queue for new response
        while not self.tts_queue.empty():
            try:
                self.tts_queue.get_nowait()
                self.tts_queue.task_done()
            except: break

        await self._safe_send_json({"type": "ai_processing", "isProcessing": True})

        rag_agent = self.services.get("rag_agent")
        if not rag_agent:
            # Fallback if RAG agent not available
            logger.warning("RAG agent not available, falling back to legacy AI service")
            return await self._legacy_process_pipeline(input_text, t_pipeline_start)

        full_response = ""
        emotion = "NEUTRAL"
        sentence_buffer = ""
        clean_so_far = ""

        try:
            # Setup the stream chunk callback
            async def on_chunk(chunk: str):
                nonlocal sentence_buffer, clean_so_far, full_response
                full_response += chunk

                if self.tts_stop_event.is_set():
                    return

                # Stream cleaned text to FE
                display = re.sub(r'\[.*?\]', '', full_response).lstrip()
                if display and display != clean_so_far:
                    clean_so_far = display
                    await self._safe_send_json({
                        "type": "ai_stream_chunk",
                        "text": clean_so_far
                    })

                # Sentence splitting for TTS - Queue sentences
                sentence_buffer += chunk
                sentences = re.split(r'(?<=[.!?\n:;])\s+', sentence_buffer)
                if len(sentences) > 1:
                    for s in sentences[:-1]:
                        if s.strip():
                            await self.tts_queue.put(s)
                    sentence_buffer = sentences[-1]

            # Execute RAG workflow
            chat_history = await rag_agent.get_session_history(self.session_id)
            result = await rag_agent.process_stream(
                user_message=input_text,
                session_id=self.session_id,
                chat_history=chat_history,
                on_chunk=on_chunk
            )

            emotion = result["emotion"]
            final_text = result["final_response"]

            # Flush remaining buffer to queue
            if sentence_buffer.strip() and not self.tts_stop_event.is_set():
                await self.tts_queue.put(sentence_buffer)

        except Exception as e:
            logger.error(f"❌ RAG pipeline error: {e}")
            final_text = "I'm sorry, I'm having trouble processing your request."
        finally:
            t_pipeline = time.time() - t_pipeline_start
            logger.info(f"⏱️ RAG pipeline done: {t_pipeline:.2f}s")
            await self._safe_send_json({"type": "ai_processing", "isProcessing": False})

        # Final AI response
        if final_text:
            await self._safe_send_json({
                "type": "ai_response",
                "text": final_text,
                "emotion": emotion
            })

    async def _legacy_process_pipeline(self, input_text: str, t_pipeline_start: float):
        """Legacy AI processing pipeline for fallback"""
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
                display = re.sub(r'\[.*?\]', '', full_response).lstrip()
                if display and display != clean_so_far:
                    clean_so_far = display
                    await self._safe_send_json({
                        "type": "ai_stream_chunk",
                        "text": clean_so_far
                    })

                # Sentence splitting for TTS - Queue sentences instead of awaiting
                sentence_buffer += chunk
                sentences = re.split(r'(?<=[.!?,\n:;])\s+', sentence_buffer)
                if len(sentences) > 1:
                    for s in sentences[:-1]:
                        if s.strip():
                            await self.tts_queue.put(s)
                    sentence_buffer = sentences[-1]

            # Flush remaining buffer to queue
            if sentence_buffer.strip() and not self.tts_stop_event.is_set():
                await self.tts_queue.put(sentence_buffer)

        except Exception as e:
            logger.error(f"❌ AI/TTS pipeline error: {e}")
        finally:
            t_pipeline = time.time() - t_pipeline_start
            logger.info(f"⏱️ legacy _process_pipeline done: {t_pipeline:.2f}s")
            await self._safe_send_json({"type": "ai_processing", "isProcessing": False})

        # Final AI response
        final_text = re.sub(r'\[.*?\]', '', full_response).strip()
        if final_text:
            await self._safe_send_json({
                "type": "ai_response",
                "text": final_text,
                "emotion": emotion
            })

    async def _send_tts_execution(self, text: str):
        """Actually generate TTS and send audio to FE (called by background worker)"""
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
            logger.error(f"TTS execution error: {e}")
