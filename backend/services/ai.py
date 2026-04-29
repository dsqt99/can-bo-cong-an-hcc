import os
import re
import json
import logging
import asyncio
from typing import Dict, List, Optional
from collections import defaultdict
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


class LLMAgent:
    """AI Agent using an OpenAI-compatible chat completions API."""

    def __init__(self):
        self.base_url = os.getenv("LLM_API_URL", "https://chat.anm05.com/api/v1")
        self.api_key = os.getenv("LLM_API_KEY", "")
        self.model = os.getenv("LLM_MODEL", "chatbot-cahy")
        self.last_messages = _env_int("LAST_MESSAGES", 20)
        self.system_prompt = (
            "You must output an emotion tag at the very start of your response: "
            "[HAPPY], [SAD], [NEUTRAL], [THINKING], [SURPRISED], or [ANGRY]. "
            "Example: '[HAPPY] Hello! How can I help you today?'"
        )
        self.sessions: Dict[str, List[Dict[str, str]]] = defaultdict(list)
        self.client = AsyncOpenAI(
            base_url=self.base_url,
            api_key=self.api_key,
        )

        logger.info(f"🤖 AI Agent initialized: model={self.model}, base_url={self.base_url}")

    def get_session_history(self, session_id: str) -> List[Dict[str, str]]:
        return self.sessions[session_id]

    def clear_session(self, session_id: str):
        if session_id in self.sessions:
            self.sessions[session_id] = []
            logger.info(f"Cleared session: {session_id}")

    def clear_all_sessions(self):
        self.sessions.clear()
        logger.info("Cleared all sessions")

    def _build_messages(self, session_id: str, user_message: str) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": self.system_prompt}]
        messages.extend(self.sessions[session_id][-self.last_messages:])
        messages.append({"role": "user", "content": user_message})
        return messages

    def _add_to_history(self, session_id: str, role: str, content: str):
        self.sessions[session_id].append({
            "role": role,
            "content": content
        })

        if len(self.sessions[session_id]) > self.last_messages:
            self.sessions[session_id] = self.sessions[session_id][-self.last_messages:]

        try:
            from services.db import db_manager
            asyncio.create_task(db_manager.save_message(session_id, role, content))
        except RuntimeError:
            pass

    @staticmethod
    def _strip_think(text: str) -> str:
        return re.sub(r'<think>[\s\S]*?</think>', '', text)

    async def process(self, text: str, session_id: str = "default"):
        try:
            messages = self._build_messages(session_id, text)
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
            )
            assistant_message = self._strip_think(response.choices[0].message.content or "")

            if assistant_message.strip():
                self._add_to_history(session_id, "user", text)
                self._add_to_history(session_id, "assistant", assistant_message.strip())

            return assistant_message

        except Exception as e:
            logger.error(f"AI Processing Error: {e}")
            return "[NEUTRAL] I'm sorry, I'm having trouble thinking right now."

    async def process_stream(self, text: str, session_id: str = "default"):
        full_response = ""
        yielded_length = 0

        try:
            messages = self._build_messages(session_id, text)
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.7,
                stream=True,
            )

            async for token in self._sdk_stream_tokens(stream):
                full_response += token
                clean_text = self._strip_think(full_response)
                in_think_block = full_response.count('<think>') > full_response.count('</think>')

                if in_think_block:
                    last_think_idx = clean_text.rfind('<think>')
                    if last_think_idx != -1:
                        clean_text = clean_text[:last_think_idx]

                if not in_think_block:
                    new_text = clean_text[yielded_length:]
                    if new_text:
                        if new_text.endswith(('<', '<t', '<th', '<thi', '<thin', '<think')):
                            continue
                        yield new_text
                        yielded_length += len(new_text)

            clean_response = self._strip_think(full_response)
            new_text = clean_response[yielded_length:]
            if new_text:
                yield new_text

            if clean_response.strip():
                self._add_to_history(session_id, "user", text)
                self._add_to_history(session_id, "assistant", clean_response.strip())

        except Exception as e:
            logger.error(f"AI Streaming Error: {e}")
            yield "[NEUTRAL] I'm sorry, I'm having trouble thinking right now."

    @staticmethod
    async def _sdk_stream_tokens(stream):
        async for chunk in stream:
            if chunk.choices and len(chunk.choices) > 0:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content
                if chunk.choices[0].finish_reason is not None:
                    break

    def update_prompt(self, new_prompt: str):
        if new_prompt:
            self.system_prompt = new_prompt
            logger.info("🤖 System prompt updated")

    def update_all_configs(
        self,
        provider: Optional[str] = None,
        model: Optional[str] = None,
        url: Optional[str] = None,
        key: Optional[str] = None,
    ):
        needs_reinit = False

        if model and model != self.model:
            self.model = model

        if url and url != self.base_url:
            self.base_url = url
            needs_reinit = True

        if key is not None and key != self.api_key:
            self.api_key = key
            needs_reinit = True

        if needs_reinit:
            logger.info(f"🤖 Re-initializing LLM client: model={self.model}, base_url={self.base_url}")
            self.client = AsyncOpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
            )
