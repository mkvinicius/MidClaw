"""
MidClaw File Tools — read/write/list with path safety checks
"""

import os
from pathlib import Path
from .base import BaseTool

# Root allowed for file operations — override with MIDCLAW_WORKSPACE env var
WORKSPACE = Path(os.getenv("MIDCLAW_WORKSPACE", os.path.expanduser("~/midclaw-workspace")))


def safe_path(rel_path: str) -> Path | None:
    """Resolve path and ensure it stays inside WORKSPACE."""
    try:
        resolved = (WORKSPACE / rel_path).resolve()
        if not str(resolved).startswith(str(WORKSPACE.resolve())):
            return None
        return resolved
    except Exception:
        return None


class FileReadTool(BaseTool):
    name = "file_read"
    description = "Read a file from the MidClaw workspace. Returns file content."
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative path within workspace"},
            "max_bytes": {"type": "integer", "description": "Max bytes to read (default: 32768)", "default": 32768},
        },
        "required": ["path"],
    }

    async def run(self, args: dict, session_key: str = "") -> dict:
        rel = args.get("path", "")
        max_bytes = int(args.get("max_bytes", 32768))
        p = safe_path(rel)
        if not p:
            return {"error": "Path outside workspace"}
        if not p.exists():
            return {"error": f"File not found: {rel}"}
        try:
            content = p.read_bytes()[:max_bytes].decode("utf-8", errors="replace")
            return {"path": rel, "content": content, "size": p.stat().st_size}
        except Exception as e:
            return {"error": str(e)}


class FileWriteTool(BaseTool):
    name = "file_write"
    description = "Write content to a file in the MidClaw workspace."
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative path within workspace"},
            "content": {"type": "string", "description": "Content to write"},
            "append": {"type": "boolean", "description": "Append instead of overwrite (default: false)", "default": False},
        },
        "required": ["path", "content"],
    }

    async def run(self, args: dict, session_key: str = "") -> dict:
        rel = args.get("path", "")
        content = args.get("content", "")
        append = bool(args.get("append", False))
        p = safe_path(rel)
        if not p:
            return {"error": "Path outside workspace"}
        try:
            WORKSPACE.mkdir(parents=True, exist_ok=True)
            p.parent.mkdir(parents=True, exist_ok=True)
            mode = "a" if append else "w"
            p.write_text(content, encoding="utf-8") if mode == "w" else p.open("a").write(content)
            return {"path": rel, "bytes_written": len(content.encode())}
        except Exception as e:
            return {"error": str(e)}


class FileListTool(BaseTool):
    name = "file_list"
    description = "List files in a workspace directory."
    parameters = {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "Relative directory path (default: root)", "default": ""},
            "pattern": {"type": "string", "description": "Glob pattern (default: *)", "default": "*"},
        },
    }

    async def run(self, args: dict, session_key: str = "") -> dict:
        rel = args.get("path", "")
        pattern = args.get("pattern", "*")
        p = safe_path(rel) if rel else WORKSPACE
        if not p:
            return {"error": "Path outside workspace"}
        if not p.exists():
            return {"files": []}
        try:
            files = [str(f.relative_to(WORKSPACE)) for f in p.glob(pattern) if f.is_file()]
            return {"files": files[:200]}
        except Exception as e:
            return {"error": str(e)}
