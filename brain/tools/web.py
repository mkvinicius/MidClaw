"""
MidClaw Web Tool — HTTP fetch + basic scraping
"""

import asyncio
import re
from typing import Any
from .base import BaseTool

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False


def strip_html(html: str) -> str:
    """Very basic HTML stripping — removes tags, collapses whitespace."""
    text = re.sub(r"<script[^>]*>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class WebFetchTool(BaseTool):
    name = "web_fetch"
    description = "Fetch a URL and return the page content as plain text."
    parameters = {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL to fetch"},
            "max_chars": {
                "type": "integer",
                "description": "Max characters to return (default: 8000)",
                "default": 8000,
            },
        },
        "required": ["url"],
    }

    async def run(self, args: dict, session_key: str = "") -> Any:
        if not HAS_HTTPX:
            return {"error": "httpx not installed. Run: uv sync"}

        url = args.get("url", "")
        max_chars = int(args.get("max_chars", 8000))

        # Block private IPs / SSRF attempts
        import socket
        try:
            from urllib.parse import urlparse
            hostname = urlparse(url).hostname or ""
            ip = socket.gethostbyname(hostname)
            private_ranges = ["127.", "10.", "192.168.", "172.16.", "169.254.", "::1", "0."]
            if any(ip.startswith(r) for r in private_ranges):
                return {"error": "SSRF protection: private IP addresses are not allowed"}
        except Exception:
            pass

        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
                resp = await client.get(url, headers={"User-Agent": "MidClaw/0.1"})
                content_type = resp.headers.get("content-type", "")

                if "html" in content_type:
                    text = strip_html(resp.text)
                else:
                    text = resp.text

                return {
                    "url": str(resp.url),
                    "status": resp.status_code,
                    "content": text[:max_chars],
                    "truncated": len(text) > max_chars,
                }
        except Exception as e:
            return {"error": str(e)}
