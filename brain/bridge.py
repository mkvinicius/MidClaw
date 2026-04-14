"""
MidClaw Brain Bridge — FastAPI HTTP server for TypeScript↔Python communication
Listens on BRAIN_HOST:BRAIN_PORT (default 127.0.0.1:7432)

Endpoints:
  POST /chat          — single-turn LLM call
  POST /stream        — streaming LLM call (SSE)
  POST /tool          — execute a registered tool
  GET  /tools         — list available tools
  GET  /health        — liveness check
"""

import os
import json
import asyncio
from typing import AsyncGenerator
from dotenv import load_dotenv

load_dotenv()

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.responses import StreamingResponse
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    raise RuntimeError("Run: uv sync  (fastapi + uvicorn not installed)")

from agent import chat, stream_chat
from tools.registry import ToolRegistry

# ─── Request / Response models ────────────────────────────────────────────────

class ChatRequest(BaseModel):
    messages: list[dict]
    system: str = ""
    model: str = ""

class ToolRequest(BaseModel):
    name: str
    args: dict = {}
    session_key: str = ""

class ChatResponse(BaseModel):
    content: str
    model: str = ""

# ─── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="MidClaw Brain Bridge", version="0.1.0")
registry = ToolRegistry()

@app.get("/health")
def health():
    return {"status": "ok", "tools": registry.list_names()}

@app.get("/tools")
def list_tools():
    return {"tools": registry.list_tools()}

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest):
    try:
        content = chat(req.messages, system=req.system, model=req.model)
        return ChatResponse(content=content, model=req.model)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/stream")
def stream_endpoint(req: ChatRequest):
    def generate():
        try:
            for chunk in stream_chat(req.messages, system=req.system, model=req.model):
                data = json.dumps({"chunk": chunk})
                yield f"data: {data}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/tool")
async def tool_endpoint(req: ToolRequest):
    tool = registry.get(req.name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{req.name}' not found")
    try:
        result = await tool.run(req.args, session_key=req.session_key)
        return {"result": result, "tool": req.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    host = os.getenv("BRAIN_HOST", "127.0.0.1")
    port = int(os.getenv("BRAIN_PORT", "7432"))
    print(f"[Bridge] Starting MidClaw Brain Bridge on {host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")
