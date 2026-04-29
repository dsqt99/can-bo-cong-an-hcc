"""OpenWebUI RAG API client for retrieving context from knowledge base."""
import os
import httpx
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class OpenWebUIRetriever:
    """Client for OpenWebUI RAG API - retrieves context from knowledge base."""

    def __init__(self):
        self.base_url = os.getenv("LLM_API_URL", "https://chat.anm05.com/api/v1")
        self.api_key = os.getenv("LLM_API_KEY", "")
        self.model = os.getenv("LLM_MODEL", "chatbot-cahy")
        self._client = httpx.AsyncClient(timeout=30.0)
        logger.info(f"🔍 OpenWebUI Retriever initialized: {self.base_url}")

    async def search(
        self,
        query: str,
        collection_ids: List[str] = None,
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Search knowledge base using OpenWebUI RAG via chat completions.

        Args:
            query: User query to search for
            collection_ids: List of knowledge base collection IDs
            top_k: Number of results to retrieve

        Returns:
            List of context chunks with source information
        """
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        # Build messages for context retrieval
        messages = [
            {"role": "system", "content": "Use the provided context to answer accurately."},
            {"role": "user", "content": query}
        ]

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "stream": False
        }

        # Add files/collections for RAG if specified
        if collection_ids:
            payload["files"] = [
                {"type": "collection", "id": cid}
                for cid in collection_ids
            ]

        try:
            logger.debug(f"🔍 Searching knowledge base with query: {query[:50]}...")
            resp = await self._client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

            # Extract context from citations if available
            context = []
            citations = data.get("citations", [])

            for citation in citations:
                context.append({
                    "source": citation.get("source", {}),
                    "content": citation.get("content", ""),
                    "document": citation.get("document", [])
                })

            logger.info(f"✅ Retrieved {len(context)} context chunks from knowledge base")
            return context

        except httpx.HTTPStatusError as e:
            logger.error(f"❌ HTTP error searching knowledge base: {e.response.status_code} - {e.response.text}")
            return []
        except Exception as e:
            logger.error(f"❌ Error searching knowledge base: {e}")
            return []

    async def close(self):
        """Close HTTP client."""
        await self._client.aclose()