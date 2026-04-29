"""LangGraph workflow definition for RAG Agent."""
from langgraph.graph import StateGraph, END
import logging

from .state import RAGState
from .nodes import route_query, retrieve_context, augment_prompt

logger = logging.getLogger(__name__)


def build_rag_graph():
    """
    Build the LangGraph workflow for RAG operations.

    Flow:
    User Query -> Route -> [Retrieve -> Augment] OR [Augment (no context)] -> Generation (external)
    """
    logger.info("🏗️ Building RAG LangGraph workflow...")

    # Initialize state graph
    workflow = StateGraph(RAGState)

    # Add nodes
    workflow.add_node("route", route_query)
    workflow.add_node("retrieve", retrieve_context)
    workflow.add_node("augment", augment_prompt)

    # Set entry point
    workflow.set_entry_point("route")

    # Conditional routing based on 'needs_retrieval'
    def should_retrieve(state: RAGState) -> str:
        return "retrieve" if state.get("needs_retrieval", False) else "augment"

    workflow.add_conditional_edges(
        "route",
        should_retrieve,
        {
            "retrieve": "retrieve",
            "augment": "augment"
        }
    )

    # Linear flow after routing
    workflow.add_edge("retrieve", "augment")
    workflow.add_edge("augment", END)

    # Compile the graph
    return workflow.compile()