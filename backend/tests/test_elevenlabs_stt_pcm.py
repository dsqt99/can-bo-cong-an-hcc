import asyncio
import base64
import json

import pytest

from services.elevenlabs_stt import ElevenLabsSTTService


class FakeElevenLabsWebSocket:
    def __init__(self):
        self.sent_messages = []
        self.recv_messages = asyncio.Queue()
        self.recv_messages.put_nowait(json.dumps({"message_type": "session_started", "session_id": "s1"}))
        self.recv_messages.put_nowait(json.dumps({"message_type": "partial_transcript", "text": "xin"}))
        self.recv_messages.put_nowait(json.dumps({"message_type": "committed_transcript", "text": "xin chào"}))

    async def send(self, message):
        self.sent_messages.append(json.loads(message))

    async def recv(self):
        return await self.recv_messages.get()


class FakeConnect:
    def __init__(self, websocket):
        self.websocket = websocket

    async def __aenter__(self):
        return self.websocket

    async def __aexit__(self, exc_type, exc, tb):
        return False


@pytest.mark.asyncio
async def test_stream_transcribe_pcm_forwards_chunks_without_waiting_for_full_buffer(monkeypatch):
    fake_ws = FakeElevenLabsWebSocket()

    def fake_connect(*args, **kwargs):
        return FakeConnect(fake_ws)

    monkeypatch.setattr("services.elevenlabs_stt.websockets.connect", fake_connect)

    service = ElevenLabsSTTService(api_key="test-key", language="vi")
    queue = asyncio.Queue()
    partials = []

    async def on_partial(text, is_final):
        partials.append((text, is_final))

    task = asyncio.create_task(
        service.stream_transcribe_pcm(queue, on_partial=on_partial, timeout_after_done=0.05)
    )

    first_pcm = b"\x01\x00" * 160
    second_pcm = b"\x02\x00" * 160
    await queue.put(first_pcm)
    await asyncio.sleep(0)
    await queue.put(second_pcm)
    await queue.put(b"")

    transcript = await task

    audio_messages = [m for m in fake_ws.sent_messages if m.get("message_type") == "input_audio_chunk"]
    assert transcript == "xin chào"
    assert partials == [("xin", False), ("xin chào", True)]
    assert len(audio_messages) == 2
    assert base64.b64decode(audio_messages[0]["audio_base_64"]) == first_pcm
    assert base64.b64decode(audio_messages[1]["audio_base_64"]) == second_pcm
    assert all(m["sample_rate"] == 16000 for m in audio_messages)
