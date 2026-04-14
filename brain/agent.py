"""
MidClaw Brain — LLM Agent
Multi-provider: Anthropic, OpenAI, OpenRouter, Ollama
Pattern from Hermes Agent run_agent.py
"""

import os
import json
import asyncio
from typing import AsyncIterator
from dotenv import load_dotenv

load_dotenv()


def get_client():
    """Return the best available LLM client based on env vars."""
    if os.getenv("ANTHROPIC_API_KEY"):
        import anthropic
        return "anthropic", anthropic.Anthropic()

    if os.getenv("OPENAI_API_KEY"):
        from openai import OpenAI
        return "openai", OpenAI()

    if os.getenv("OPENROUTER_API_KEY"):
        from openai import OpenAI
        return "openrouter", OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        )

    raise RuntimeError(
        "No LLM provider configured. "
        "Set ANTHROPIC_API_KEY, OPENAI_API_KEY or OPENROUTER_API_KEY in .env"
    )


def chat(messages: list[dict], system: str = "", model: str = "") -> str:
    """Single-turn LLM call. Returns full response text."""
    provider, client = get_client()
    model = model or os.getenv("MIDCLAW_MODEL", "claude-sonnet-4-6")

    if provider == "anthropic":
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=system or "You are MidClaw, an AI security agent.",
            messages=messages,
        )
        return response.content[0].text

    else:
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.extend(messages)
        response = client.chat.completions.create(
            model=model,
            messages=msgs,
        )
        return response.choices[0].message.content


def stream_chat(messages: list[dict], system: str = "", model: str = ""):
    """Streaming LLM call. Yields text chunks."""
    provider, client = get_client()
    model = model or os.getenv("MIDCLAW_MODEL", "claude-sonnet-4-6")

    if provider == "anthropic":
        with client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system or "You are MidClaw, an AI security agent.",
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text

    else:
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.extend(messages)
        for chunk in client.chat.completions.create(
            model=model, messages=msgs, stream=True
        ):
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta


if __name__ == "__main__":
    import sys
    from rich.console import Console
    from rich.markdown import Markdown

    console = Console()

    if len(sys.argv) < 2:
        console.print("[bold red]Usage:[/] python agent.py 'your message'")
        sys.exit(1)

    prompt = sys.argv[1]
    console.print(f"[dim]You:[/] {prompt}\n")
    console.print("[dim]MidClaw:[/] ", end="")

    full = ""
    for chunk in stream_chat([{"role": "user", "content": prompt}]):
        print(chunk, end="", flush=True)
        full += chunk

    print("\n")
