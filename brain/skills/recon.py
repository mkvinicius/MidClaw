"""
MidClaw Recon Skill — target reconnaissance workflow
Chains: whois → port scan → web headers → summary
"""

from __future__ import annotations
import asyncio
from typing import Any
from .base import BaseSkill


class ReconSkill(BaseSkill):
    name = "recon"
    description = "Perform reconnaissance on a target: WHOIS, port scan, web headers."
    trigger_phrases = [
        "reconheça", "reconhecer", "recon", "scan the target",
        "gather information", "coletar informações", "analisar alvo",
        "what ports", "quais portas",
    ]

    async def run(self, goal: str, context: dict[str, Any]) -> dict[str, Any]:
        target = context.get("target", "")
        if not target:
            # Try to extract from goal
            words = goal.split()
            for i, w in enumerate(words):
                if w in ("target", "alvo", "on", "sobre") and i + 1 < len(words):
                    target = words[i + 1].strip(".,")
                    break

        if not target:
            return {"output": "Could not determine reconnaissance target.", "success": False}

        results = []
        results.append(f"# Recon Report: {target}\n")

        # WHOIS (passive)
        try:
            proc = await asyncio.create_subprocess_exec(
                "whois", target,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
            whois_out = stdout.decode("utf-8", errors="replace")[:2000]
            results.append(f"## WHOIS\n```\n{whois_out}\n```\n")
        except Exception as e:
            results.append(f"## WHOIS\nError: {e}\n")

        # Basic connectivity check
        try:
            proc = await asyncio.create_subprocess_exec(
                "ping", "-c", "3", "-W", "2", target,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
            ping_out = stdout.decode("utf-8", errors="replace")
            results.append(f"## Ping\n```\n{ping_out}\n```\n")
        except Exception as e:
            results.append(f"## Ping\nError: {e}\n")

        output = "\n".join(results)
        return {
            "output": output,
            "target": target,
            "success": True,
        }
