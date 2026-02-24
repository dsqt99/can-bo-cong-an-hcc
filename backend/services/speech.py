import os
import re
import asyncio
import io
import logging
import sys
import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

class TextToSpeechService:
    def __init__(self, tts_engine="vieneu"):
        self.tts_engine = "vieneu"
        self.vieneu_tts = None
        self.client = None  # Gradio Client
        self.default_ref_codes = None
        self.default_ref_text = None
        self.normalizer = None
        self.default_voice = "Ngọc (nữ miền Bắc)"  # changeable at runtime

        if tts_engine == "vieneu" or tts_engine == "viterbox":
            # Try to initialize Gradio Client first (User Preference)
            self._init_gradio_client()
            # Fallback to local if client fails or not desired? 
            # User asked to update code for API, so we prioritize it.
            # Local init removed as per request
            pass

    def _init_gradio_client(self):
        try:
            from gradio_client import Client
            import ssl
            logger.info("🔌 Connecting to VieNeu-TTS Gradio API...")
            # Use the URL provided by user or env
            # Disable SSL verification for self-signed certificate
            tts_url = os.getenv("TTS_API_URL", "https://vieneu-tts.anm05.com/")
            self.client = Client(tts_url, ssl_verify=False)
            logger.info("✅ Connected to VieNeu-TTS Gradio API")
        except Exception as e:
            logger.error(f"❌ Failed to connect to VieNeu-TTS Gradio API: {e}")
            self.client = None

    def _init_vieneu(self):
        # Local initialization removed as per request
        pass

    def update_voice(self, voice_name: str):
        return
    
    def update_speaking_rate(self, rate: float):
        return
    
    def update_tts_engine(self, engine: str):
        return

    def _split_into_sentences(self, text):
        """Split text into sentences for streaming TTS"""
        clean_text = text
        if text.startswith("[") and "]" in text:
            end_idx = text.find("]")
            clean_text = text[end_idx+1:].strip()
        
        sentences = re.split(r'([.!?。！？]+)', clean_text)
        result = []
        for i in range(0, len(sentences) - 1, 2):
            if i + 1 < len(sentences):
                sentence = sentences[i] + sentences[i + 1]
                if sentence.strip():
                    result.append(sentence.strip())
        if len(sentences) % 2 == 1 and sentences[-1].strip():
            result.append(sentences[-1].strip())
        
        if not result:
            return [clean_text] if clean_text else []
        
        return result

    async def synthesize(self, text, audio_prompt=None, language="vi"):
        clean_text = text
        if text.startswith("[") and "]" in text:
            end_idx = text.find("]")
            clean_text = text[end_idx+1:].strip()
            
        if not clean_text:
            return b""
            
        if self.normalizer:
            clean_text = self.normalizer.normalize(clean_text)

        loop = asyncio.get_event_loop()
        
        def run_infer():
            try:
                # --- OPTION 1: Gradio API (Priority) ---
                if self.client:
                    try:
                        # Determine voice (Default: Tuyên)
                        voice = self.default_voice
                        if audio_prompt and isinstance(audio_prompt, str) and len(audio_prompt) < 100:
                            voice = audio_prompt
                        
                        logger.info(f"📡 Calling VieNeu-TTS API for: '{clean_text[:20]}...' with voice '{voice}'")
                        
                        # Call /synthesize_speech endpoint with required parameters
                        result = self.client.predict(
                            text=clean_text,
                            voice_choice=voice,
                            custom_audio=None,           # No custom audio
                            custom_text="",              # No custom text
                            generation_mode="Standard (Một lần)",
                            use_batch=True,
                            max_batch_size_run=4,
                            custom_voice_audio=None,     # No custom voice audio
                            custom_voice_text="",        # No custom voice text
                            temperature=1.0,
                            max_chars_chunk=256,
                            api_name="/synthesize_speech"
                        )
                        
                        # Result is a tuple: (filepath, status_text)
                        if isinstance(result, tuple) and len(result) >= 1:
                            filepath = result[0]
                            if isinstance(filepath, str) and os.path.exists(filepath):
                                with open(filepath, "rb") as f:
                                    return f.read()
                        elif isinstance(result, str) and os.path.exists(result):
                            with open(result, "rb") as f:
                                return f.read()
                                
                    except Exception as api_err:
                        logger.error(f"❌ API call failed: {api_err}. Falling back to local if available.")
                        # Continue to local...

                # --- OPTION 2: Local Inference (REMOVED) ---
                # Fallback to beep if API fails
                return self._generate_beep()
            except Exception as e:
                logger.error(f"VieNeu synthesis error: {e}", exc_info=True)
                return self._generate_beep()
                
        return await loop.run_in_executor(None, run_infer)

    def _generate_beep(self):
        sr = 24000
        t = np.linspace(0, 0.5, int(sr*0.5), endpoint=False)
        wave = 0.5 * np.sin(2*np.pi*440*t).astype(np.float32)
        buf = io.BytesIO()
        sf.write(buf, wave, sr, format="WAV")
        return buf.getvalue()

    async def synthesize_stream(self, text, stop_event=None):
        clean_text = text
        if text.startswith("[") and "]" in text:
            end_idx = text.find("]")
            clean_text = text[end_idx+1:].strip()
        
        if not clean_text:
            return
        
        sentences = self._split_into_sentences(clean_text)
        
        for sentence in sentences:
            if not sentence.strip():
                continue
            
            if stop_event and stop_event.is_set():
                logger.info("🛑 TTS stopped - user started speaking")
                break
            
            try:
                audio_chunk = await self.synthesize(sentence)
                if audio_chunk:
                    if stop_event and stop_event.is_set():
                        logger.info("🛑 TTS stopped before sending chunk")
                        break
                    
                    yield audio_chunk
                    logger.info(f"🔊 Synthesized sentence audio chunk: {len(audio_chunk)} bytes")
            except Exception as e:
                logger.error(f"TTS Error for sentence '{sentence}': {e}")
                continue