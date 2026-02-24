import os
import re
import logging
from typing import Dict, List
from collections import defaultdict
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class LLMAgent:
    """
    AI Agent using OpenAI-compatible API (vLLM + LiteLLM backend).
    Uses the `openai` Python SDK for both streaming and non-streaming chat completions.
    """

    def __init__(self):
        self.base_url = os.getenv("LLM_API_URL", "https://chat.anm05.com/api")
        self.api_key = os.getenv("LLM_API_KEY", os.getenv("LITELLM_MASTER_KEY", ""))
        self.model = os.getenv("LLM_MODEL", "chatbot-cahy")
        self.system_prompt = (
            "You are a helpful voice assistant. Keep your responses concise and conversational. "
            "You also need to output an emotion tag at the start of your response like [HAPPY], [SAD], [NEUTRAL], [THINKING], [SURPRISED], [ANGRY]. "
            "Example: '[HAPPY] Hello! How can I help you today?'"
        )
        # Store chat history per session
        self.sessions: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        
        # Initialize AsyncOpenAI client
        self.client = None
        self.update_model(self.model)
        
        logger.info(f"🤖 AI Agent initialized: model={self.model}")

    def update_prompt(self, new_prompt: str):
        """Update the system prompt"""
        self.system_prompt = new_prompt

    def update_model(self, model_name: str):
        """Update the AI model and recreate client if needed"""
        self.model = model_name
        
        if "gemini" in self.model.lower():
            self.base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
            self.api_key = os.getenv("GOOGLE_API_KEY", "")
        else:
            self.base_url = os.getenv("LLM_API_URL", "https://chat.anm05.com/api")
            self.api_key = os.getenv("LLM_API_KEY", os.getenv("LITELLM_MASTER_KEY", ""))
            
        self.client = AsyncOpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
        )
        logger.info(f"🤖 AI model updated to: {model_name}, api_base={self.base_url}")

    def get_session_history(self, session_id: str) -> List[Dict[str, str]]:
        """Get chat history for a session"""
        return self.sessions[session_id]

    def clear_session(self, session_id: str):
        """Clear chat history for a session"""
        if session_id in self.sessions:
            self.sessions[session_id] = []
            logger.info(f"Cleared session: {session_id}")

    def clear_all_sessions(self):
        """Clear all chat sessions"""
        self.sessions.clear()
        logger.info("Cleared all sessions")

    def _build_messages(self, session_id: str, user_message: str) -> List[Dict[str, str]]:
        """Build messages array with system prompt and chat history"""
        messages = []
        
        # Add system prompt as first message
        messages.append({
            "role": "system",
            "content": self.system_prompt
        })
        
        # Add chat history
        messages.extend(self.sessions[session_id])
        
        # Add current user message
        messages.append({
            "role": "user",
            "content": user_message
        })
        
        return messages

    def _add_to_history(self, session_id: str, role: str, content: str):
        """Add a message to session history"""
        self.sessions[session_id].append({
            "role": role,
            "content": content
        })
        
        # Limit history to last 20 messages to prevent memory issues
        if len(self.sessions[session_id]) > 20:
            self.sessions[session_id] = self.sessions[session_id][-20:]

    @staticmethod
    def _strip_think(text: str) -> str:
        """Remove <think>...</think> blocks from Qwen3 model output"""
        return re.sub(r'<think>[\s\S]*?</think>', '', text).strip()

    async def process(self, text: str, session_id: str = "default"):
        """Process text and return full response (non-streaming)"""
        try:
            messages = self._build_messages(session_id, text)
            
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
            )
            
            assistant_message = response.choices[0].message.content or ""
            assistant_message = self._strip_think(assistant_message)
            
            if assistant_message:
                self._add_to_history(session_id, "user", text)
                self._add_to_history(session_id, "assistant", assistant_message)
            
            return assistant_message
                
        except Exception as e:
            logger.error(f"AI Processing Error: {e}")
            return "[NEUTRAL] I'm sorry, I'm having trouble thinking right now."

    async def process_stream(self, text: str, session_id: str = "default"):
        """Process text and stream response chunks using OpenAI streaming API.
        Strips <think>...</think> blocks from Qwen3 output before yielding."""
        full_response = ""
        in_think_block = False
        think_ended = False
        
        try:
            messages = self._build_messages(session_id, text)
            
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                stream=True,
            )
            
            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta and delta.content:
                        token = delta.content
                        full_response += token
                        
                        # Skip tokens inside <think>...</think>
                        if not think_ended:
                            if '<think>' in full_response and not in_think_block:
                                in_think_block = True
                            if in_think_block:
                                if '</think>' in full_response:
                                    think_ended = True
                                    # Extract content after </think>
                                    after_think = full_response.split('</think>', 1)[1].strip()
                                    if after_think:
                                        yield after_think
                                continue
                        else:
                            yield token
                    
                    # Check for finish reason
                    if chunk.choices[0].finish_reason is not None:
                        break
            
            # Strip think block from full response for history
            clean_response = self._strip_think(full_response)
            
            # After streaming completes, add to history
            if clean_response:
                self._add_to_history(session_id, "user", text)
                self._add_to_history(session_id, "assistant", clean_response)
                
        except Exception as e:
            logger.error(f"AI Streaming Error: {e}")
            error_msg = "[NEUTRAL] I'm sorry, I'm having trouble thinking right now."
            yield error_msg
