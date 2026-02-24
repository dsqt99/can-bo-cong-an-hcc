# Voice Bot AI - Real-time Voice Chat Application

## Overview
A real-time voice chat application with AI-powered responses, featuring emotional emoji feedback and streaming audio processing.

## Features
- **Speech-to-Text**: Google Cloud Speech streaming API for Vietnamese voice recognition
- **AI Processing**: Gemini AI with emotion detection
- **Text-to-Speech**: Google Cloud TTS for Vietnamese voice synthesis
- **Emoji Feedback**: Dynamic emoji display based on conversation emotion
- **WebSocket**: Real-time bidirectional audio streaming

## Architecture

### Backend (Python/FastAPI)
- `backend/main.py`: Main FastAPI server with WebSocket endpoints
- `backend/services/speech.py`: Google Cloud Speech-to-Text and Text-to-Speech services
- `backend/services/ai.py`: Gemini AI agent with emotion tagging
- `backend/emoji/`: Static emoji assets (GIF files)

### Frontend (React/Vite)
- `frontend/src/App.jsx`: Main application with voice control
- `frontend/src/components/EmojiDisplay.jsx`: Emotion-based emoji renderer
- `frontend/src/hooks/useAudioStream.js`: WebSocket audio streaming logic

## Setup

### Prerequisites
1. **Google Cloud Credentials**:
   - Service Account JSON with Speech-to-Text, Text-to-Speech, and Vertex AI permissions
   - Gemini API key

2. **Environment Variables**:
   Create `backend/.env`:
   ```
   GOOGLE_API_KEY=your_gemini_api_key
   GOOGLE_APPLICATION_CREDENTIALS=path/to/service_account.json
   ```

### Installation

#### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
```
Server runs on `http://localhost:8000`

#### Frontend
```bash
cd frontend
npm install
npm run dev
```
App runs on `http://localhost:5173`

## Usage

1. Open `http://localhost:5173` in your browser
2. Click the microphone button to start recording
3. Speak in Vietnamese (or any configured language)
4. Watch the emoji change based on the conversation emotion
5. Listen to the AI's voice response

## Emoji Mapping

- `NEUTRAL`: Default/idle state
- `HAPPY`: Positive responses
- `SAD`: Sad/negative responses
- `ANGRY`: Frustrated responses
- `SURPRISED`: Unexpected information
- `THINKING`: Processing/considering
- `LISTENING`: Active listening state
- `SPEAKING`: AI is responding

## API Endpoints

### WebSocket
- `ws://localhost:8000/ws/chat`: Bidirectional audio streaming

### Static Files
- `http://localhost:8000/emojis/{emoji_name}.gif`: Emoji assets

## Troubleshooting

### Emoji not loading
- Ensure `backend/emoji/` directory contains all GIF files
-Verify emoji endpoint: `curl -I http://localhost:8000/emojis/neutral.gif`
- Check browser console for 404 errors

### Audio not recording
- Grant microphone permissions in browser
- Check MediaRecorder API support (Chrome/Firefox)

### No AI response
- Verify `GOOGLE_API_KEY` in `.env`
- Check backend logs for API errors

## Technologies

- **Backend**: Python 3.11+, FastAPI, Uvicorn, Google Cloud APIs, Langchain
- **Frontend**: React 18, Vite, TailwindCSS, Lucide Icons
- **Real-time**: WebSocket, MediaRecorder API, Web Audio API

## License
MIT

## Credits
Emoji assets from Dasai to Xiaozhi collection
