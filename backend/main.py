
import os
import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import uvicorn
from pydantic import BaseModel
from fastapi.responses import Response
from typing import Optional

# Services
from services.ai import LLMAgent
from services.rag_agent import StreamingRAGAgent
from services.elevenlabs_speech import ElevenLabsTTSService
from services.elevenlabs_stt import ElevenLabsSTTService

# Session Manager
from session_manager import SessionManager

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Emoji Static Files
EMOJI_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "emoji")
if os.path.exists(EMOJI_DIR):
    app.mount("/emojis", StaticFiles(directory=EMOJI_DIR), name="emojis")
else:
    logger.warning(f"Emoji directory not found at {EMOJI_DIR}")

# Default settings
default_settings = {
    "aiModel": "chatbot-cahy",
    "sttModel": "large-v3",
    "systemPrompt": "You are a helpful voice assistant. Keep your responses concise and conversational. You also need to output an emotion tag at the start of your response like [HAPPY], [SAD], [NEUTRAL], [THINKING], [SURPRISED], [ANGRY]. Example: '[HAPPY] Hello! How can I help you today?'",
    "mcpServer": "",
}

# Initialize Services
ai_agent = LLMAgent()
rag_agent = StreamingRAGAgent()

# ElevenLabs only
elevenlabs_stt_service = ElevenLabsSTTService()
elevenlabs_tts_service = ElevenLabsTTSService()

logger.info(f"🔊 TTS Provider: ElevenLabs → {elevenlabs_tts_service.__class__.__name__}")
logger.info(f"🎤 STT Provider: ElevenLabs → {elevenlabs_stt_service.__class__.__name__}")

class TTSRequest(BaseModel):
    text: str
    audioPrompt: Optional[str] = None
    language: Optional[str] = None

from services.db import db_manager

@app.on_event("startup")
async def startup_event():
    await db_manager.init_db()

@app.get("/")
async def root():
    return {"message": "Voice Bot AI Backend Running"}

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

@app.post("/api/clear-session/{session_id}")
async def clear_session(session_id: str):
    """Clear chat history for a specific session"""
    ai_agent.clear_session(session_id)
    return {"message": f"Session {session_id} cleared"}

@app.post("/api/clear-all-sessions")
async def clear_all_sessions():
    """Clear all chat sessions"""
    ai_agent.clear_all_sessions()
    return {"message": "All sessions cleared"}

@app.get("/api/session/{session_id}/history")
async def get_session_history(session_id: str):
    """Get chat history for a specific session"""
    history = ai_agent.get_session_history(session_id)
    return {"session_id": session_id, "history": history}

@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    try:
        if not request.text:
            return Response(status_code=400)

        logger.info(f"🔊 generating audio for: {request.text[:50]}...")
        audio_content = await elevenlabs_tts_service.synthesize(
            request.text,
            language=request.language or "vi",
        )
        return Response(content=audio_content, media_type="audio/wav")
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        return Response(status_code=500)

@app.post("/api/knowledge/search")
async def search_knowledge(query: str, top_k: int = 5):
    """Search knowledge base directly using RAG API"""
    try:
        from services.rag.retriever import get_retriever
        retriever = get_retriever()
        kb_id = os.getenv("RAG_KNOWLEDGE_BASE_ID", "")

        results = await retriever.search(
            query=query,
            collection_ids=[kb_id] if kb_id else None,
            top_k=top_k
        )
        return {"results": results}
    except Exception as e:
        logger.error(f"Error searching knowledge: {e}")
        return {"error": str(e), "results": []}

@app.get("/api/rag/status")
async def rag_status():
    """Check RAG configuration status"""
    return {
        "enabled": os.getenv("RAG_ENABLED", "true").lower() == "true",
        "knowledge_base_id": os.getenv("RAG_KNOWLEDGE_BASE_ID", ""),
        "model": os.getenv("LLM_MODEL", "chatbot-cahy"),
        "last_messages": os.getenv("LAST_MESSAGES", "20")
    }

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Bundle services for the session
    services = {
        "ai": ai_agent,
        "rag_agent": rag_agent,
        "stream_stt": elevenlabs_stt_service,
        "tts": elevenlabs_tts_service,
        "elevenlabs_stt": elevenlabs_stt_service,
        "elevenlabs_tts": elevenlabs_tts_service,
    }
    
    session = SessionManager(websocket, services, default_settings)
    
    try:
        await session.start()
        
        while True:
            try:
                message = await websocket.receive()
                # Check for disconnect message
                if message.get("type") == "websocket.disconnect":
                    logger.info(f"WebSocket gracefully disconnected: {session.session_id}")
                    break
                await session.handle_message(message)
            except RuntimeError as e:
                # Handle "Cannot call receive once a disconnect message has been received"
                logger.debug(f"WebSocket receive error (likely disconnect): {e}")
                break
            
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session.session_id}")
    except Exception as e:
        logger.error(f"WebSocket error in session {session.session_id}: {e}")
    finally:
        await session.cleanup()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
