import asyncio
import os
import websockets
import soundfile as sf
import logging
import io
import numpy as np
from typing import AsyncGenerator, Optional, Callable
import json

logger = logging.getLogger(__name__)

class StreamSTTService:
    """
    Streaming Speech-to-Text service using WebSocket connection
    Connects to cahy-stt.anm05.com for real-time transcription
    """
    
    def __init__(
        self, 
        ws_url: str = None,
        model: str = "large-v3",
        lang: str = "vi",
        chunk_size: int = 4096
    ):
        """
        Initialize Stream STT Service
        
        Args:
            ws_url: WebSocket URL for STT service
            model: Model to use (e.g., 'large-v3')
            lang: Language code (e.g., 'vi' for Vietnamese)
            chunk_size: Size of audio chunks to send (in samples)
        """
        self.ws_url = ws_url or os.getenv("STT_WS_URL", "wss://cahy-stt.anm05.com/stream")
        self.model = model
        self.lang = lang
        self.chunk_size = chunk_size
        self.websocket = None
        
    def get_connection_url(self) -> str:
        """Build WebSocket connection URL with parameters"""
        return f"{self.ws_url}?model={self.model}&lang={self.lang}"
    
    async def stream_audio_file(
        self, 
        audio_file_path: str,
        on_result: Optional[Callable[[str], None]] = None
    ) -> list[str]:
        """
        Stream audio from a file and get transcription results
        
        Args:
            audio_file_path: Path to audio file (WAV format recommended)
            on_result: Optional callback function to handle each result
            
        Returns:
            List of transcription results
        """
        results = []
        uri = self.get_connection_url()
        
        try:
            async with websockets.connect(uri) as websocket:
                logger.info(f"✅ Connected to STT WebSocket: {uri}")
                
                # Read audio file
                data, samplerate = sf.read(audio_file_path, dtype='int16')
                logger.info(f"📁 Loaded audio: {len(data)} samples at {samplerate}Hz")
                
                # Send audio in chunks
                for i in range(0, len(data), self.chunk_size):
                    chunk = data[i:i+self.chunk_size].tobytes()
                    await websocket.send(chunk)
                    
                    # Try to receive response (non-blocking)
                    try:
                        result = await asyncio.wait_for(
                            websocket.recv(), 
                            timeout=0.01
                        )
                        logger.info(f"📝 Received: {result}")
                        results.append(result)
                        
                        if on_result:
                            on_result(result)
                            
                    except asyncio.TimeoutError:
                        pass
                
                # Wait for final results
                try:
                    while True:
                        result = await asyncio.wait_for(
                            websocket.recv(), 
                            timeout=1.0
                        )
                        logger.info(f"📝 Final result: {result}")
                        results.append(result)
                        
                        if on_result:
                            on_result(result)
                            
                except asyncio.TimeoutError:
                    logger.info("⏱️ No more results, closing connection")
                    
        except Exception as e:
            logger.error(f"❌ Error in stream_audio_file: {e}")
            raise
            
        return results
    
    async def stream_audio_bytes(
        self,
        audio_data: bytes,
        sample_rate: int = 16000,
        on_result: Optional[Callable[[str], None]] = None
    ) -> list[str]:
        """
        Stream audio from bytes and get transcription results
        
        Args:
            audio_data: Audio data in bytes (WAV format)
            sample_rate: Sample rate of audio
            on_result: Optional callback function to handle each result
            
        Returns:
            List of transcription results
        """
        results = []
        uri = self.get_connection_url()
        
        try:
            async with websockets.connect(uri) as websocket:
                logger.info(f"✅ Connected to STT WebSocket: {uri}")
                
                # Convert bytes to numpy array
                audio_io = io.BytesIO(audio_data)
                data, sr = sf.read(audio_io, dtype='int16')
                logger.info(f"📁 Loaded audio: {len(data)} samples at {sr}Hz")
                
                # Send audio in chunks
                for i in range(0, len(data), self.chunk_size):
                    chunk = data[i:i+self.chunk_size].tobytes()
                    await websocket.send(chunk)
                    
                    # Try to receive response (non-blocking)
                    try:
                        result = await asyncio.wait_for(
                            websocket.recv(), 
                            timeout=0.01
                        )
                        logger.info(f"📝 Received: {result}")
                        results.append(result)
                        
                        if on_result:
                            on_result(result)
                            
                    except asyncio.TimeoutError:
                        pass
                
                # Wait for final results
                try:
                    while True:
                        result = await asyncio.wait_for(
                            websocket.recv(), 
                            timeout=1.0
                        )
                        logger.info(f"📝 Final result: {result}")
                        results.append(result)
                        
                        if on_result:
                            on_result(result)
                            
                except asyncio.TimeoutError:
                    logger.info("⏱️ No more results, closing connection")
                    
        except Exception as e:
            logger.error(f"❌ Error in stream_audio_bytes: {e}")
            raise
            
        return results
    
    async def stream_audio_generator(
        self,
        audio_generator: AsyncGenerator[bytes, None],
        on_result: Optional[Callable[[str], None]] = None
    ) -> list[str]:
        """
        Stream audio from an async generator and get transcription results
        Useful for real-time microphone input
        
        Args:
            audio_generator: Async generator yielding audio chunks
            on_result: Optional callback function to handle each result
            
        Returns:
            List of transcription results
        """
        results = []
        uri = self.get_connection_url()
        send_done = asyncio.Event()
        
        try:
            async with websockets.connect(uri) as websocket:
                logger.info(f"✅ Connected to STT WebSocket: {uri}")
                
                async def send_audio():
                    """Send audio chunks, then signal completion"""
                    try:
                        async for chunk in audio_generator:
                            if chunk:
                                try:
                                    await websocket.send(chunk)
                                except websockets.exceptions.ConnectionClosed:
                                    logger.info("🔌 STT WebSocket closed during send")
                                    break
                    except Exception as e:
                        logger.error(f"❌ Error sending audio: {e}")
                    finally:
                        send_done.set()
                        logger.info("📤 Audio send complete, waiting for final results...")
                
                async def receive_results():
                    """Receive results. After send is done, apply a timeout for remaining results."""
                    try:
                        while True:
                            # If send is done, use a shorter timeout for remaining results
                            if send_done.is_set():
                                try:
                                    result = await asyncio.wait_for(
                                        websocket.recv(),
                                        timeout=3.0  # Wait up to 3s for final results
                                    )
                                except asyncio.TimeoutError:
                                    logger.info("⏱️ No more STT results after send completed")
                                    break
                            else:
                                result = await websocket.recv()
                            
                            logger.info(f"📝 Received: {result}")
                            results.append(result)
                            
                            if on_result:
                                on_result(result)
                                
                    except websockets.exceptions.ConnectionClosed:
                        logger.info("🔌 WebSocket connection closed")
                    except Exception as e:
                        logger.error(f"❌ Error receiving results: {e}")
                
                # Run send and receive concurrently
                await asyncio.gather(
                    send_audio(),
                    receive_results()
                )
                    
        except Exception as e:
            logger.error(f"❌ Error in stream_audio_generator: {e}")
            raise
            
        return results
    
    async def transcribe_realtime(
        self,
        audio_chunks: list[bytes],
        on_partial_result: Optional[Callable[[str, bool], None]] = None
    ) -> str:
        """
        Transcribe audio chunks in real-time with partial results
        
        Args:
            audio_chunks: List of audio chunks (raw PCM int16 bytes)
            on_partial_result: Callback(text, is_final) for partial/final results
            
        Returns:
            Final transcription text
        """
        uri = self.get_connection_url()
        final_text = ""
        
        try:
            async with websockets.connect(uri) as websocket:
                logger.info(f"✅ Connected to STT WebSocket: {uri}")
                
                # Send all chunks
                for chunk in audio_chunks:
                    await websocket.send(chunk)
                    
                    # Try to get partial results
                    try:
                        result = await asyncio.wait_for(
                            websocket.recv(),
                            timeout=0.01
                        )
                        
                        # Parse result if JSON
                        try:
                            result_data = json.loads(result)
                            text = result_data.get("text", result)
                            is_final = result_data.get("is_final", False)
                        except:
                            text = result
                            is_final = False
                        
                        if on_partial_result:
                            on_partial_result(text, is_final)
                        
                        if is_final:
                            final_text = text
                            
                    except asyncio.TimeoutError:
                        pass
                
                # Get final result
                try:
                    result = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=2.0
                    )
                    
                    try:
                        result_data = json.loads(result)
                        final_text = result_data.get("text", result)
                    except:
                        final_text = result
                    
                    if on_partial_result:
                        on_partial_result(final_text, True)
                        
                except asyncio.TimeoutError:
                    logger.warning("⏱️ Timeout waiting for final result")
                    
        except Exception as e:
            logger.error(f"❌ Error in transcribe_realtime: {e}")
            raise
            
        return final_text


# Example usage function
async def example_usage():
    """Example of how to use StreamSTTService"""
    
    # Initialize service
    stt = StreamSTTService(
        ws_url="wss://cahy-stt.anm05.com/stream",
        model="large-v3",
        lang="vi"
    )
    
    # Example 1: Transcribe from file
    def print_result(result):
        print(f"Result: {result}")
    
    results = await stt.stream_audio_file(
        "audio.wav",
        on_result=print_result
    )
    
    print(f"\nAll results: {results}")
    
    # Example 2: Transcribe from bytes
    with open("audio.wav", "rb") as f:
        audio_bytes = f.read()
    
    results = await stt.stream_audio_bytes(
        audio_bytes,
        on_result=print_result
    )
    
    # Example 3: Real-time transcription with partial results
    def handle_partial(text, is_final):
        status = "FINAL" if is_final else "PARTIAL"
        print(f"[{status}] {text}")
    
    # Simulate audio chunks
    data, sr = sf.read("audio.wav", dtype='int16')
    chunk_size = 4096
    chunks = [
        data[i:i+chunk_size].tobytes() 
        for i in range(0, len(data), chunk_size)
    ]
    
    final_text = await stt.transcribe_realtime(
        chunks,
        on_partial_result=handle_partial
    )
    
    print(f"\nFinal transcription: {final_text}")


if __name__ == "__main__":
    # Run example
    asyncio.run(example_usage())
