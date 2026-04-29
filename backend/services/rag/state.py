"""State definition for LangGraph RAG workflow."""
from typing import TypedDict, List, Dict, Any, Optional


class RAGState(TypedDict):
    """
    Represents the state of the RAG workflow through LangGraph nodes.
    """
    session_id: str
    user_message: str
    chat_history: List[Dict[str, str]]

    # RAG specific fields
    needs_retrieval: bool
    retrieved_context: Optional[List[Dict[str, Any]]]
    generation_input: str

    # Generation outputs
    response_chunks: List[str]
    final_response: str
    emotion: str

    # Optional metadata
    metadata: Dict[str, Any]