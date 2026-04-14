"""
MidClaw Shell Tool — safe command execution with timeout + output capture
"""

import asyncio
import shlex
from .base import BaseTool


BLOCKED_COMMANDS = {
    "rm", "dd", "mkfs", "fdisk", "shred", "wipefs",
    "shutdown", "reboot", "halt", "poweroff", "init",
    "kill", "killall", "pkill",
    "chmod", "chown", "sudo", "su",
    "passwd", "useradd", "userdel",
}


class ShellTool(BaseTool):
    name = "shell_exec"
    description = "Execute a shell command and return stdout + stderr. Dangerous commands are blocked."
    parameters = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "Shell command to execute",
            },
            "timeout": {
                "type": "integer",
                "description": "Timeout in seconds (default: 30, max: 120)",
                "default": 30,
            },
            "working_dir": {
                "type": "string",
                "description": "Working directory (optional)",
            },
        },
        "required": ["command"],
    }

    async def run(self, args: dict, session_key: str = "") -> dict:
        command = args.get("command", "")
        timeout = min(int(args.get("timeout", 30)), 120)
        working_dir = args.get("working_dir") or None

        # Safety: block dangerous base commands
        try:
            parts = shlex.split(command)
            base = parts[0] if parts else ""
            if base in BLOCKED_COMMANDS:
                return {"error": f"Command '{base}' is blocked by policy", "stdout": "", "stderr": ""}
        except Exception:
            pass

        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=working_dir,
            )
            try:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                return {"error": f"Command timed out after {timeout}s", "stdout": "", "stderr": ""}

            return {
                "stdout": stdout.decode("utf-8", errors="replace")[:8192],
                "stderr": stderr.decode("utf-8", errors="replace")[:2048],
                "returncode": proc.returncode,
            }
        except Exception as e:
            return {"error": str(e), "stdout": "", "stderr": ""}
