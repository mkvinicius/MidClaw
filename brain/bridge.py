"""
MidClaw Brain Bridge — FastAPI + Web UI
Serve a interface web em / e a API em /api/

Endpoints web:
  GET  /              → Chat UI
  GET  /static/*      → Arquivos estáticos (JS, CSS)

Endpoints API:
  POST /api/chat      → LLM single-turn
  POST /api/stream    → LLM streaming (SSE)
  POST /api/tool      → Executar ferramenta
  GET  /api/tools     → Listar ferramentas
  GET  /api/health    → Status do sistema
  GET  /api/vault/notes       → Listar notas
  GET  /api/vault/search      → Buscar (FTS5)
  GET  /api/vault/note        → Ler nota por path
  POST /api/sim/run           → Executar simulação
"""

import os
import json
import sqlite3
import sys
import asyncio
from pathlib import Path
from typing import Any
from dotenv import load_dotenv

load_dotenv()

# Add project root to path so sim/ is importable
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

try:
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
    from fastapi.staticfiles import StaticFiles
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
except ImportError:
    raise RuntimeError("Run: uv sync")

from agent import chat, stream_chat
from tools.registry import ToolRegistry

# ─── Paths ────────────────────────────────────────────────────────────────────

WEB_DIR = ROOT / "web"
VAULT_PATH = Path(os.getenv("MIDCLAW_VAULT_PATH", Path.home() / ".midclaw" / "vault.db"))

# ─── Models ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    messages: list[dict]
    system: str = ""
    model: str = ""

class ToolRequest(BaseModel):
    name: str
    args: dict = {}
    session_key: str = ""

class SimRequest(BaseModel):
    actor: str = "generic-ransomware"
    scenario: str = "Generic cyberattack simulation"
    target: str = "corporate Windows network"
    steps: int = 5
    defender: str = "average"
    model: str = ""

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(title="MidClaw", version="0.1.0", docs_url="/api/docs")
registry = ToolRegistry()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Vault helpers (Python reads same SQLite DB as TypeScript) ────────────────

def get_vault_db() -> sqlite3.Connection | None:
    if not VAULT_PATH.exists():
        return None
    conn = sqlite3.connect(str(VAULT_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def row_to_note(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["tags"] = json.loads(d.get("tags", "[]"))
    except Exception:
        d["tags"] = []
    try:
        d["related"] = json.loads(d.get("related", "[]"))
    except Exception:
        d["related"] = []
    return d

# ─── Static files ─────────────────────────────────────────────────────────────

if WEB_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

@app.get("/")
def frontend():
    html = WEB_DIR / "index.html"
    if html.exists():
        return FileResponse(str(html))
    return JSONResponse({"error": "Web UI not found. Run from project root."}, status_code=404)

# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    db = get_vault_db()
    vault_notes = 0
    if db:
        try:
            vault_notes = db.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        except Exception:
            pass
        db.close()

    model = os.getenv("MIDCLAW_MODEL", "claude-sonnet-4-6")
    provider = "anthropic" if os.getenv("ANTHROPIC_API_KEY") else \
               "openai" if os.getenv("OPENAI_API_KEY") else \
               "openrouter" if os.getenv("OPENROUTER_API_KEY") else "none"

    return {
        "status": "ok",
        "model": model,
        "provider": provider,
        "vault_notes": vault_notes,
        "vault_path": str(VAULT_PATH),
        "tools": registry.list_names(),
    }

# ─── Chat ─────────────────────────────────────────────────────────────────────

@app.post("/api/chat")
def chat_endpoint(req: ChatRequest):
    try:
        content = chat(req.messages, system=req.system, model=req.model)
        return {"content": content, "model": req.model}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stream")
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

# ─── Tools ────────────────────────────────────────────────────────────────────

@app.get("/api/tools")
def list_tools():
    return {"tools": registry.list_tools()}

@app.post("/api/tool")
async def tool_endpoint(req: ToolRequest):
    tool = registry.get(req.name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{req.name}' not found")
    try:
        result = await tool.run(req.args, session_key=req.session_key)
        return {"result": result, "tool": req.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Vault ────────────────────────────────────────────────────────────────────

@app.get("/api/vault/notes")
def vault_list(type: str = Query(default=""), limit: int = Query(default=50)):
    db = get_vault_db()
    if not db:
        return {"notes": [], "total": 0}
    try:
        if type:
            rows = db.execute(
                "SELECT * FROM notes WHERE type = ? ORDER BY updated_at DESC LIMIT ?",
                (type, limit)
            ).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM notes ORDER BY updated_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
        notes = [row_to_note(r) for r in rows]
        total = db.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        types_raw = db.execute("SELECT type, COUNT(*) as c FROM notes GROUP BY type").fetchall()
        types = {r["type"]: r["c"] for r in types_raw}
        return {"notes": notes, "total": total, "types": types}
    finally:
        db.close()

@app.get("/api/vault/search")
def vault_search(q: str = Query(...), limit: int = Query(default=10)):
    db = get_vault_db()
    if not db:
        return {"results": []}
    try:
        rows = db.execute(
            """SELECT n.* FROM notes n
               JOIN notes_fts f ON n.path = f.path
               WHERE notes_fts MATCH ?
               ORDER BY rank LIMIT ?""",
            (q, limit)
        ).fetchall()
        return {"results": [row_to_note(r) for r in rows], "query": q}
    except Exception as e:
        return {"results": [], "error": str(e)}
    finally:
        db.close()

@app.get("/api/vault/note")
def vault_get(path: str = Query(...)):
    db = get_vault_db()
    if not db:
        raise HTTPException(status_code=404, detail="Vault not found")
    try:
        row = db.execute("SELECT * FROM notes WHERE path = ?", (path,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"Note '{path}' not found")
        note = row_to_note(row)
        # Get backlinks
        backlinks = db.execute(
            "SELECT DISTINCT n.path, n.title, n.type FROM wikilinks w JOIN notes n ON w.source_path = n.path WHERE w.target_path = ?",
            (path,)
        ).fetchall()
        note["backlinks"] = [dict(r) for r in backlinks]
        return note
    finally:
        db.close()

# ─── Simulation ───────────────────────────────────────────────────────────────

@app.post("/api/sim/run")
async def sim_run(req: SimRequest):
    try:
        from sim.runner import run_simulation, SimulationConfig  # type: ignore
        config = SimulationConfig(
            scenario=req.scenario,
            target_environment=req.target,
            actor=req.actor,
            max_steps=req.steps,
            defender_level=req.defender,
            model=req.model,
        )
        report = await run_simulation(config)
        return {
            "markdown": report.to_markdown(),
            "summary": report.summary(),
            "outcome": report.outcome,
            "risk_score": report.risk_score,
            "findings": report.findings,
            "mitigations": report.mitigations,
            "techniques_used": report.techniques_used,
            "iocs": report.all_iocs,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    host = os.getenv("BRAIN_HOST", "127.0.0.1")
    port = int(os.getenv("BRAIN_PORT", "7432"))
    print(f"[MidClaw] Web UI → http://{host}:{port}")
    print(f"[MidClaw] API    → http://{host}:{port}/api/health")
    print(f"[MidClaw] Docs   → http://{host}:{port}/api/docs")
    uvicorn.run(app, host=host, port=port, log_level="info")
