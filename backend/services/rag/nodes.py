"""Nodes for LangGraph RAG workflow."""
import os
import logging
from typing import Dict, Any

from .state import RAGState
from .retriever import OpenWebUIRetriever

logger = logging.getLogger(__name__)

# Initialize retriever instance
_retriever = None

def get_retriever():
    global _retriever
    if _retriever is None:
        _retriever = OpenWebUIRetriever()
    return _retriever


async def route_query(state: RAGState) -> Dict[str, Any]:
    """
    Node: Determine if the query requires RAG retrieval.
    """
    logger.debug(f"🔄 Routing query: {state['user_message'][:50]}...")

    # Check if RAG is enabled globally via env var
    rag_enabled = os.getenv("RAG_ENABLED", "true").lower() == "true"
    kb_id = os.getenv("RAG_KNOWLEDGE_BASE_ID", "")

    # For now, if RAG is enabled and we have a KB ID, always retrieve
    needs_retrieval = rag_enabled and bool(kb_id)

    return {"needs_retrieval": needs_retrieval}


async def retrieve_context(state: RAGState) -> Dict[str, Any]:
    """
    Node: Retrieve relevant context from OpenWebUI knowledge base.
    """
    logger.info("📚 Retrieving context from knowledge base...")
    kb_id = os.getenv("RAG_KNOWLEDGE_BASE_ID", "")

    if not kb_id:
        logger.warning("⚠️ No knowledge base ID configured, skipping retrieval.")
        return {"retrieved_context": []}

    try:
        retriever = get_retriever()
        top_k = int(os.getenv("RAG_TOP_K", "5"))

        results = await retriever.search(
            query=state["user_message"],
            collection_ids=[kb_id],
            top_k=top_k
        )

        return {"retrieved_context": results}

    except Exception as e:
        logger.error(f"❌ Context retrieval failed: {e}")
        return {
            "retrieved_context": [],
            "metadata": {**(state.get("metadata", {})), "retrieval_error": str(e)}
        }


def augment_prompt(state: RAGState) -> Dict[str, Any]:
    """
    Node: Combine retrieved context with the user query to create the generation input.
    """
    logger.debug("✨ Augmenting prompt with context...")
    context = state.get("retrieved_context", [])
    query = state["user_message"]

    if not context:
        logger.debug("No context found, using original query.")
        return {"generation_input": query}

    # Format the context
    context_text = "\n\n".join([
        f"Nguồn: {ctx.get('source', {}).get('name', 'Tài liệu')}\n{ctx.get('content', '')}"
        for ctx in context
    ])

    augmented = f"""Dựa vào các thông tin sau đây để trả lời câu hỏi của người dùng. Nếu thông tin không có trong tài liệu, hãy trả lời theo hiểu biết của bạn nhưng ưu tiên thông tin trong tài liệu.

THÔNG TIN THAM KHẢO:
{context_text}

CÂU HỎI CỦA NGƯỜI DÙNG:
{query}"""

    return {"generation_input": augmented}