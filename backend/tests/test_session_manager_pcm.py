import asyncio

import pytest

from session_manager import SessionManager


class FakeAppWebSocket:
    def __init__(self):
        self.sent = []

    async def send_json(self, data):
        self.sent.append(data)


class FakeRealtimeStt:
    def __init__(self):
        self.chunks = []

    async def stream_transcribe_pcm(self, audio_queue, on_partial=None, timeout_after_done=2.0):
        while True:
            chunk = await audio_queue.get()
            if chunk == b"":
                break
            self.chunks.append(chunk)
        if on_partial:
            await on_partial("xin", False)
            await on_partial("xin chào", True)
        return "xin chào"


@pytest.mark.asyncio
async def test_session_manager_routes_binary_pcm_to_realtime_stt(monkeypatch):
    websocket = FakeAppWebSocket()
    stt = FakeRealtimeStt()
    manager = SessionManager(websocket, {"stream_stt": stt, "rag_agent": object(), "tts": object()}, {})
    processed = []

    async def fake_process_pipeline(text):
        processed.append(text)

    manager._process_pipeline = fake_process_pipeline

    await manager.handle_message({"text": '{"type":"audio_stream_start"}'})
    await asyncio.sleep(0.01)  # Allow STT stream task to start
    await manager.handle_message({"bytes": b"\x01\x00" * 160})
    await manager.handle_message({"bytes": b"\x02\x00" * 160})
    await manager.handle_message({"text": '{"type":"audio_stream_stop"}'})
    await asyncio.sleep(0.1)  # Allow STT stream task to complete

    assert stt.chunks == [b"\x01\x00" * 160, b"\x02\x00" * 160]
    assert processed == ["xin chào"]
    assert {"type": "transcript", "text": "xin", "isFinal": False} in websocket.sent
    assert {"type": "transcript", "text": "xin chào", "isFinal": True} in websocket.sent

    await manager.cleanup()
