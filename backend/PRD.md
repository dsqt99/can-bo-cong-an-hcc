# Product Requirements Document (PRD)
## Voice Bot AI - Backend System

**Version:** 1.0  
**Ngày tạo:** 2024  
**Mục đích:** Tài liệu mô tả yêu cầu sản phẩm cho hệ thống Voice Bot AI Backend

---

## 1. Tổng quan

### 1.1 Mô tả sản phẩm
Voice Bot AI Backend là hệ thống backend cung cấp khả năng xử lý hội thoại bằng giọng nói real-time, sử dụng công nghệ AI để nhận diện giọng nói, xử lý ngôn ngữ tự nhiên và tổng hợp giọng nói phản hồi.

### 1.2 Mục tiêu
- Cung cấp API WebSocket real-time cho giao tiếp voice
- Hỗ trợ tiếng Việt với độ chính xác cao
- Streaming response để giảm độ trễ
- Phát hiện cảm xúc từ phản hồi AI
- Tích hợp với frontend qua WebSocket

### 1.3 Phạm vi
- **In-scope:**
  - Speech-to-Text (STT) cho tiếng Việt
  - Text-to-Speech (TTS) cho tiếng Việt
  - AI conversation agent
  - Real-time streaming
  - Emotion detection
  - WebSocket API
  
- **Out-of-scope:**
  - Authentication/Authorization (có thể thêm sau)
  - Database lưu trữ lịch sử hội thoại
  - Multi-user session management
  - Payment/billing

---

## 2. Kiến trúc hệ thống

### 2.1 Công nghệ sử dụng
- **Framework:** FastAPI
- **WebSocket:** WebSocket protocol qua FastAPI
- **STT:** faster-whisper (OpenAI Whisper optimized)
- **TTS:** gTTS (primary) hoặc Coqui TTS (optional)
- **AI Agent:** Google Gemini 2.5 Flash qua LangChain
- **Audio Processing:** ffmpeg
- **Logging:** Python logging module

### 2.2 Kiến trúc luồng dữ liệu

```
Client (Frontend)
    ↓ WebSocket
Backend (FastAPI)
    ↓
[Audio Chunks] → STT Service (Whisper) → [Transcript]
    ↓
[Transcript] → AI Agent (Gemini) → [AI Response + Emotion]
    ↓
[AI Response] → TTS Service (gTTS/Coqui) → [Audio Chunks]
    ↓
[Audio Chunks] → Client (Frontend)
```

### 2.3 Các service chính

#### 2.3.1 SpeechToTextService
- **Model:** faster-whisper (Whisper base mặc định)
- **Ngôn ngữ:** Tiếng Việt (vi)
- **Sample rate:** 16kHz
- **Tính năng:**
  - Streaming recognition
  - Voice Activity Detection (VAD)
  - Hỗ trợ WebM Opus format
  - Tự động convert sang WAV format

#### 2.3.2 TextToSpeechService
- **Primary:** gTTS (Google Text-to-Speech)
- **Optional:** Coqui TTS (XTTS v2 hoặc Vietnamese model)
- **Tính năng:**
  - Streaming synthesis (sentence-by-sentence)
  - Hỗ trợ tiếng Việt
  - Tự động fallback nếu model không khả dụng
  - Output format: MP3 hoặc WAV

#### 2.3.3 GeminiAgent
- **Model:** gemini-2.5-flash
- **Tính năng:**
  - Streaming response
  - Emotion tagging (HAPPY, SAD, NEUTRAL, THINKING, SURPRISED, ANGRY)
  - Conversational AI
  - Temperature: 0.7

---

## 3. API Specification

### 3.1 WebSocket Endpoint
**URL:** `ws://host:port/ws/chat`

### 3.2 Message Protocol

#### 3.2.1 Client → Server

**1. Start Recording**
```json
{
  "type": "start_recording"
}
```
- **Mục đích:** Bắt đầu ghi âm và xử lý STT
- **Response:** `{"type": "recording_started"}`

**2. Stop Recording**
```json
{
  "type": "stop_recording"
}
```
- **Mục đích:** Dừng ghi âm và bắt đầu xử lý AI + TTS
- **Response:** `{"type": "recording_stopped"}`

**3. Audio Data (Binary)**
- **Format:** Binary WebSocket message
- **Content:** Audio chunks (WebM Opus format)
- **Gửi khi:** `is_recording = true`

**4. Audio Data (JSON)**
```json
{
  "type": "audio",
  "data": "<base64_encoded_audio>"
}
```
- **Format:** Base64 encoded audio chunks
- **Gửi khi:** `is_recording = true`

#### 3.2.2 Server → Client

**1. Transcript (Interim)**
```json
{
  "type": "transcript",
  "text": "Xin chào...",
  "isFinal": false
}
```
- **Mục đích:** Hiển thị transcript tạm thời khi đang nhận diện

**2. Transcript (Final)**
```json
{
  "type": "transcript",
  "text": "Xin chào, bạn khỏe không?",
  "isFinal": true
}
```
- **Mục đích:** Transcript cuối cùng sau khi dừng ghi âm

**3. AI Response**
```json
{
  "type": "ai_response",
  "text": "Xin chào! Tôi khỏe, cảm ơn bạn.",
  "emotion": "HAPPY"
}
```
- **Mục đích:** Phản hồi từ AI agent kèm emotion tag

**4. Audio Chunk**
```json
{
  "type": "audio",
  "data": "<base64_encoded_audio_chunk>"
}
```
- **Mục đích:** Audio chunks từ TTS service (streaming)

**5. Recording Status**
```json
{
  "type": "recording_started"
}
```
```json
{
  "type": "recording_stopped"
}
```

**6. Error Messages**
```json
{
  "type": "error",
  "message": "Không thể nhận dạng giọng nói. Vui lòng thử lại."
}
```
```json
{
  "type": "stt_error",
  "message": "STT processing failed"
}
```

### 3.3 REST Endpoints

**GET /** 
- **Mục đích:** Health check
- **Response:**
```json
{
  "message": "Voice Bot AI Backend Running"
}
```

**Static Files: /emojis/**
- **Mục đích:** Serve emoji GIF files
- **Path:** `/emojis/<filename>.gif`

---

## 4. Luồng xử lý (Workflow)

### 4.1 Luồng hoàn chỉnh

1. **Client kết nối WebSocket**
   - Server accept connection
   - Khởi tạo audio queue và flags

2. **Client gửi `start_recording`**
   - Server set `is_recording = true`
   - Clear audio queue
   - Khởi động STT processing task (async)
   - Gửi `recording_started` về client

3. **Client gửi audio chunks**
   - Server nhận audio chunks (binary hoặc base64)
   - Nếu `is_recording = true`, thêm vào audio queue
   - STT service xử lý từ queue và stream results

4. **STT streaming results**
   - Server nhận interim transcripts → gửi về client
   - Server nhận final transcript → lưu và set event

5. **Client gửi `stop_recording`**
   - Server set `is_recording = false`
   - Gửi signal `None` vào queue để dừng STT
   - Đợi final transcript (timeout 10s)
   - Gửi `recording_stopped` về client

6. **Xử lý AI và TTS**
   - Nếu có final transcript:
     - Gọi AI agent (streaming)
     - Parse emotion từ response
     - Gửi AI response + emotion về client
     - Gọi TTS service (streaming sentence-by-sentence)
     - Gửi audio chunks về client
   - Nếu không có transcript:
     - Gửi error message

### 4.2 Error Handling

- **STT Timeout:** Timeout 10s khi đợi final transcript
- **STT Error:** Gửi `stt_error` message và unblock waiting
- **TTS Error:** Log error, tiếp tục với các sentence khác
- **AI Error:** Trả về default error message với emotion NEUTRAL
- **WebSocket Disconnect:** Cleanup resources, cancel tasks

---

## 5. Yêu cầu kỹ thuật

### 5.1 Dependencies

**Core:**
- fastapi
- uvicorn
- websockets
- python-dotenv

**AI/ML:**
- langchain
- langchain-google-genai
- langchain-core

**Speech:**
- faster-whisper
- gtts
- TTS (optional, cho Coqui TTS)

**Audio:**
- numpy
- ffmpeg-python

### 5.2 Environment Variables

```env
GOOGLE_API_KEY=<your_google_api_key>
```

### 5.3 System Requirements

**Python:**
- Python 3.8 - 3.11: Full support (Coqui TTS available)
- Python 3.12+: Limited support (gTTS only)

**External Tools:**
- ffmpeg (bắt buộc cho audio conversion)

**Hardware:**
- CPU: Minimum 2 cores
- RAM: 2GB+ (4GB+ recommended)
- GPU: Optional (hỗ trợ CUDA cho Whisper và Coqui TTS)

### 5.4 Model Configuration

**Whisper Models:**
- tiny: ~39MB, fastest, lower accuracy
- base: ~74MB, balanced (default)
- small: ~244MB, better accuracy
- medium: ~769MB, high accuracy
- large-v2: ~1550MB, highest accuracy
- large-v3: ~1550MB, latest version

**TTS Models:**
- gTTS: No download required, requires internet
- Coqui XTTS v2: ~1.7GB, multilingual, high quality
- Coqui Vietnamese TTS: ~500MB, Vietnamese-specific

---

## 6. Performance Requirements

### 6.1 Latency Targets

- **STT Processing:** < 2s cho 10s audio (Whisper base, CPU)
- **AI Response (first token):** < 1s
- **TTS Synthesis:** < 1s cho câu ngắn
- **End-to-end (stop → audio):** < 5s

### 6.2 Throughput

- **Concurrent Connections:** 10+ (có thể scale với load balancer)
- **Audio Chunk Processing:** Real-time (không buffer quá 1s)

### 6.3 Resource Usage

- **Memory:** ~500MB - 2GB (tùy model size)
- **CPU:** 1-2 cores (có thể tăng với GPU)
- **Network:** Minimal (chỉ WebSocket traffic)

---

## 7. Logging & Monitoring

### 7.1 Logging

- **Level:** DEBUG (có thể config)
- **Format:** `%(asctime)s - %(name)s - %(levelname)s - %(message)s`
- **Outputs:**
  - File: `app.log` (UTF-8 encoding)
  - Console: stdout

### 7.2 Log Events

- WebSocket connections/disconnections
- Recording start/stop
- Audio chunk received
- STT results (interim và final)
- AI responses
- TTS chunks generated
- Errors và exceptions

---

## 8. Security Considerations

### 8.1 Current State
- CORS: Cho phép tất cả origins (`*`)
- No authentication/authorization
- No rate limiting

### 8.2 Recommendations (Future)
- Implement API key authentication
- Rate limiting per IP/connection
- CORS whitelist thay vì `*`
- Input validation và sanitization
- Secure WebSocket (WSS) cho production

---

## 9. Testing Requirements

### 9.1 Unit Tests
- STT service với sample audio
- TTS service với sample text
- AI agent với sample prompts
- Emotion parsing logic

### 9.2 Integration Tests
- WebSocket connection flow
- Full workflow: audio → transcript → AI → TTS
- Error handling scenarios
- Timeout scenarios

### 9.3 Performance Tests
- Latency measurements
- Concurrent connection handling
- Memory usage under load
- CPU usage patterns

---

## 10. Deployment

### 10.1 Development
```bash
cd backend
pip install -r requirements.txt
python main.py
```
- Server chạy tại `http://0.0.0.0:8000`
- Auto-reload enabled

### 10.2 Production
- Sử dụng uvicorn với workers
- Reverse proxy (nginx) cho WebSocket
- Environment variables từ secure storage
- Log rotation cho `app.log`
- Health check endpoint monitoring

---

## 11. Future Enhancements

### 11.1 Short-term
- [ ] Authentication/Authorization
- [ ] Rate limiting
- [ ] Conversation history storage
- [ ] Multi-language support (ngoài tiếng Việt)
- [ ] Custom voice models

### 11.2 Long-term
- [ ] Multi-user session management
- [ ] Voice cloning
- [ ] Advanced emotion detection
- [ ] Analytics và usage tracking
- [ ] A/B testing cho AI prompts
- [ ] Distributed processing cho scale

---

## 12. Glossary

- **STT:** Speech-to-Text (Nhận diện giọng nói)
- **TTS:** Text-to-Speech (Tổng hợp giọng nói)
- **VAD:** Voice Activity Detection (Phát hiện hoạt động giọng nói)
- **WebSocket:** Giao thức giao tiếp real-time hai chiều
- **Streaming:** Xử lý và gửi dữ liệu theo chunks thay vì đợi toàn bộ
- **Interim Results:** Kết quả tạm thời trong quá trình xử lý
- **Final Results:** Kết quả cuối cùng sau khi hoàn tất xử lý

---

## 13. Appendix

### 13.1 File Structure
```
backend/
├── main.py                 # FastAPI app và WebSocket handler
├── services/
│   ├── speech.py           # STT và TTS services
│   └── ai.py               # Gemini AI agent
├── emoji/                  # Emoji GIF files
├── requirements.txt        # Python dependencies
├── README_SETUP.md         # Setup instructions
└── PRD.md                  # This document
```

### 13.2 References
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [faster-whisper](https://github.com/guillaumekln/faster-whisper)
- [Coqui TTS](https://github.com/coqui-ai/TTS)
- [Google Gemini API](https://ai.google.dev/)
- [LangChain](https://www.langchain.com/)

---

**Document Version:** 1.0  
**Last Updated:** 2024  
**Maintained By:** Development Team

