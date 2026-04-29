"""Streaming RAG Agent combining LangGraph workflow with chat completions streaming."""
import logging
import os
import re
from typing import List, Dict, Any, Callable, Awaitable

from openai import AsyncOpenAI

from .rag.graph import build_rag_graph
from .rag.state import RAGState
from .db import db_manager

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


class StreamingRAGAgent:
    SYSTEM_PROMPT = (
        "You must output an emotion tag at the very start of your response: "
        "[HAPPY], [SAD], [NEUTRAL], [THINKING], [SURPRISED], or [ANGRY]. "
        "Example: '[HAPPY] Hello! How can I help you today?'"
    )

    def __init__(self):
        self.rag_graph = build_rag_graph()
        self.client = AsyncOpenAI(
            base_url=os.getenv("LLM_API_URL", "https://chat.anm05.com/api/v1"),
            api_key=os.getenv("LLM_API_KEY", ""),
        )
        self.model = os.getenv("LLM_MODEL", "chatbot-cahy")
        self.last_messages = _env_int("LAST_MESSAGES", 20)
        logger.info("✅ StreamingRAGAgent initialized")

    async def process_stream(
        self,
        user_message: str,
        session_id: str,
        chat_history: List[Dict[str, str]],
        on_chunk: Callable[[str], Awaitable[None]] = None
    ) -> Dict[str, Any]:
        logger.info(f"🤖 RAG Agent processing: {user_message[:50]}...")

        initial_state: RAGState = {
            "session_id": session_id,
            "user_message": user_message,
            "chat_history": chat_history,
            "needs_retrieval": False,
            "retrieved_context": None,
            "generation_input": "",
            "response_chunks": [],
            "final_response": "",
            "emotion": "NEUTRAL",
            "metadata": {}
        }

        try:
            rag_result = await self.rag_graph.ainvoke(initial_state)
        except Exception as e:
            logger.error(f"❌ LangGraph workflow error: {e}")
            rag_result = initial_state

        generation_input = rag_result.get("generation_input", user_message)
        retrieved_context = rag_result.get("retrieved_context", [])

        if retrieved_context:
            logger.info(f"📚 Retrieved {len(retrieved_context)} context chunks")

        messages = [
            {"role": "system", "content": self.SYSTEM_PROMPT},
            *chat_history[-self.last_messages:],
            {"role": "user", "content": generation_input}
        ]

        chunks = []
        full_response = ""

        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                stream=True,
            )
            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if not delta or not delta.content:
                    continue
                chunks.append(delta.content)
                full_response += delta.content
                if on_chunk:
                    await on_chunk(delta.content)
        except Exception as e:
            logger.error(f"❌ Generation streaming error: {e}")

        emotion = self.extract_emotion(full_response)
        final_response = self.clean_response(full_response)

        try:
            if final_response.strip():
                await db_manager.save_message(session_id, "user", user_message)
                await db_manager.save_message(session_id, "assistant", final_response)
        except Exception as e:
            logger.error(f"⚠️ Failed to save history: {e}")

        logger.info(f"✅ RAG Agent completed, emotion: {emotion}")

        return {
            "final_response": final_response,
            "emotion": emotion,
            "chunks": chunks,
            "retrieved_context": retrieved_context
        }

    async def get_session_history(self, session_id: str) -> List[Dict[str, str]]:
        try:
            return await db_manager.load_session(session_id)
        except Exception as e:
            logger.error(f"❌ Error getting session history: {e}")
            return []

    async def clear_session(self, session_id: str):
        try:
            await db_manager.clear_session(session_id)
        except Exception as e:
            logger.error(f"❌ Error clearing session: {e}")

    async def close(self):
        try:
            from .rag.retriever import get_retriever
            retriever = get_retriever()
            await retriever.close()
        except Exception as e:
            logger.error(f"❌ Error during cleanup: {e}")

    @staticmethod
    def extract_emotion(text: str) -> str:
        match = re.search(r'^\[(HAPPY|SAD|NEUTRAL|THINKING|SURPRISED|ANGRY)\]', text)
        if match:
            return match.group(1)
        return "NEUTRAL"

    @staticmethod
    def clean_response(text: str) -> str:
        return re.sub(r'\[.*?\]', '', text).strip()
