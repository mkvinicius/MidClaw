"""
MidClaw BaseTool — abstract base for all brain-layer tools
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any


class BaseTool(ABC):
    name: str = ""
    description: str = ""
    parameters: dict = {}

    @abstractmethod
    async def run(self, args: dict[str, Any], session_key: str = "") -> Any:
        """Execute the tool. Must be async."""
        ...

    def to_anthropic_schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }

    def to_openai_schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }
