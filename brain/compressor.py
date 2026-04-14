"""
MidClaw Context Compressor — compress long conversation history
Uses the LLM itself to summarize older turns, keeping recent ones intact.
Pattern from Hermes Agent context management.
"""

from __future__ import annotations
from typing import Any
from agent import chat


# Keep this many recent messages verbatim (rest gets compressed)
RECENT_KEEP = 6
# Compress when total messages exceed this
COMPRESS_THRESHOLD = 20
# Approx tokens per char (rough estimate)
CHARS_PER_TOKEN = 4


def estimate_tokens(messages: list[dict]) -> int:
    total = sum(len(str(m.get("content", ""))) for m in messages)
    return total // CHARS_PER_TOKEN


def compress(
    messages: list[dict],
    system: str = "",
    model: str = "",
    threshold: int = COMPRESS_THRESHOLD,
) -> list[dict]:
    """
    If messages exceed threshold, summarize older ones into a single
    assistant message and keep the most recent RECENT_KEEP messages.
    Returns the (possibly compressed) message list.
    """
    if len(messages) <= threshold:
        return messages

    old = messages[:-RECENT_KEEP]
    recent = messages[-RECENT_KEEP:]

    # Ask the LLM to summarize the older context
    summary_prompt = (
        "The following is a conversation history. "
        "Write a concise summary (3-5 bullet points) capturing:\n"
        "- Key decisions made\n"
        "- Important facts discovered\n"
        "- Current task state\n"
        "- Any outstanding issues\n\n"
        "Conversation:\n" +
        "\n".join(f"{m['role'].upper()}: {m.get('content', '')}" for m in old)
    )

    try:
        summary = chat(
            [{"role": "user", "content": summary_prompt}],
            system="You are a conversation summarizer. Be concise and factual.",
            model=model,
        )
    except Exception:
        # Fallback: just drop old messages
        return recent

    compressed: list[dict] = [
        {
            "role": "assistant",
            "content": f"[Conversation summary — {len(old)} messages compressed]\n\n{summary}",
        }
    ]
    compressed.extend(recent)
    return compressed


def should_compress(messages: list[dict], token_limit: int = 50_000) -> bool:
    return len(messages) > COMPRESS_THRESHOLD or estimate_tokens(messages) > token_limit
