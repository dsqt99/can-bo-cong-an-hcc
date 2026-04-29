import logging
import numpy as np

logger = logging.getLogger(__name__)

class SileroVoiceActivityDetector:
    def __init__(self, sample_rate=16000, threshold=0.5):
        self.sample_rate = sample_rate
        self.threshold = threshold
        self._model = None
        self._torch = None

    def _ensure_loaded(self):
        if self._model is not None:
            return
        import torch
        self._torch = torch
        try:
            model, _ = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                trust_repo=True,
                verbose=False,
            )
        except TypeError:
            model, _ = torch.hub.load(
                repo_or_dir="snakers4/silero-vad",
                model="silero_vad",
                verbose=False,
            )
        self._model = model
        self._model.eval()

    def speech_probability(self, pcm16le_bytes: bytes) -> float:
        self._ensure_loaded()
        if not pcm16le_bytes:
            return 0.0
        audio_int16 = np.frombuffer(pcm16le_bytes, dtype=np.int16)
        if audio_int16.size == 0:
            return 0.0
        audio = audio_int16.astype(np.float32) / 32768.0
        x = self._torch.from_numpy(audio)
        if x.ndim == 1:
            x = x.unsqueeze(0)
        with self._torch.no_grad():
            prob = self._model(x, self.sample_rate).item()
        return float(prob)

    def is_speech(self, pcm16le_bytes: bytes) -> bool:
        return self.speech_probability(pcm16le_bytes) >= self.threshold

class VoiceActivityDetector:
    """Voice Activity Detection using WebRTC VAD for silence detection"""
    
    def __init__(self, sample_rate=16000, frame_duration_ms=30, silence_threshold_ms=3000):
        """
        Initialize VAD
        sample_rate: Audio sample rate (16000 for WebRTC VAD)
        frame_duration_ms: Frame duration in milliseconds (10, 20, or 30)
        silence_threshold_ms: Duration of silence to trigger (default 3 seconds)
        """
        self.sample_rate = sample_rate
        self.frame_duration_ms = frame_duration_ms
        self.silence_threshold_ms = silence_threshold_ms
        
        # WebRTC VAD only supports 8000, 16000, 32000, 48000 Hz
        if sample_rate not in [8000, 16000, 32000, 48000]:
            raise ValueError(f"Sample rate {sample_rate} not supported. Must be 8000, 16000, 32000, or 48000")
        
        # Frame duration must be 10, 20, or 30 ms
        if frame_duration_ms not in [10, 20, 30]:
            raise ValueError(f"Frame duration {frame_duration_ms}ms not supported. Must be 10, 20, or 30")
        
        self.vad = webrtcvad.Vad(2)  # Aggressiveness: 0-3, 2 is moderate
        self.frame_size = int(sample_rate * frame_duration_ms / 1000)
        self.silence_frames = int(silence_threshold_ms / frame_duration_ms)
        
        logger.info(f"✅ VAD initialized: sample_rate={sample_rate}Hz, frame={frame_duration_ms}ms, silence_threshold={silence_threshold_ms}ms")
    
    def is_speech(self, audio_frame: bytes) -> bool:
        """
        Check if audio frame contains speech
        audio_frame: PCM audio bytes (16-bit signed integers, mono)
        Returns: True if speech detected, False if silence
        """
        try:
            # WebRTC VAD requires exact frame size
            if len(audio_frame) != self.frame_size * 2:  # 2 bytes per sample (16-bit)
                return False
            
            return self.vad.is_speech(audio_frame, self.sample_rate)
        except Exception as e:
            logger.error(f"❌ VAD error: {e}")
            return False
    
    def detect_silence_stream(self, audio_generator):
        """
        Detect silence in audio stream
        Yields: (is_speech: bool, silence_duration_ms: float)
        """
        silence_frame_count = 0
        total_frames = 0
        
        for audio_chunk in audio_generator:
            if audio_chunk is None:
                break
            
            # Convert to PCM if needed (assuming WebM Opus input)
            # For now, assume audio is already PCM 16-bit mono
            # In practice, you'd need to convert WebM to PCM first
            
            # Check each frame in the chunk
            chunk_size = len(audio_chunk)
            num_frames = chunk_size // (self.frame_size * 2)
            
            for i in range(num_frames):
                frame_start = i * self.frame_size * 2
                frame_end = frame_start + self.frame_size * 2
                if frame_end > chunk_size:
                    break
                
                frame = audio_chunk[frame_start:frame_end]
                is_speech_frame = self.is_speech(frame)
                total_frames += 1
                
                if is_speech_frame:
                    silence_frame_count = 0
                    yield (True, 0.0)
                else:
                    silence_frame_count += 1
                    silence_duration_ms = silence_frame_count * self.frame_duration_ms
                    yield (False, silence_duration_ms)
                    
                    # Check if silence threshold reached
                    if silence_duration_ms >= self.silence_threshold_ms:
                        logger.info(f"🔇 Silence detected: {silence_duration_ms:.0f}ms")
                        return  # Stop processing, silence detected
