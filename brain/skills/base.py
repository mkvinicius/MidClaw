"""
MidClaw BaseSkill — abstract base for procedural skill workflows
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any


class BaseSkill(ABC):
    name: str = ""
    description: str = ""
    trigger_phrases: list[str] = []  # Phrases that suggest this skill should activate

    @abstractmethod
    async def run(self, goal: str, context: dict[str, Any]) -> dict[str, Any]:
        """
        Execute the skill workflow.
        Returns a result dict with at least {"output": str, "success": bool}
        """
        ...

    def matches(self, text: str) -> bool:
        """Check if this skill should handle the given text."""
        lower = text.lower()
        return any(phrase.lower() in lower for phrase in self.trigger_phrases)
