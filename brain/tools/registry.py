"""
MidClaw Tool Registry — dynamic tool registration for the brain layer
"""

from __future__ import annotations
import importlib
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base import BaseTool


class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, "BaseTool"] = {}
        self._auto_load()

    def _auto_load(self):
        """Auto-load all tool modules in this directory."""
        tool_dir = os.path.dirname(__file__)
        for fname in os.listdir(tool_dir):
            if fname.startswith("_") or not fname.endswith(".py"):
                continue
            if fname in ("registry.py", "base.py"):
                continue
            module_name = f"tools.{fname[:-3]}"
            try:
                mod = importlib.import_module(module_name)
                for attr in dir(mod):
                    obj = getattr(mod, attr)
                    if (
                        isinstance(obj, type)
                        and hasattr(obj, "name")
                        and hasattr(obj, "run")
                        and attr != "BaseTool"
                    ):
                        instance = obj()
                        self._tools[instance.name] = instance
            except Exception as e:
                print(f"[ToolRegistry] failed to load {module_name}: {e}")

    def register(self, tool: "BaseTool") -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> "BaseTool | None":
        return self._tools.get(name)

    def list_names(self) -> list[str]:
        return list(self._tools.keys())

    def list_tools(self) -> list[dict]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters,
            }
            for t in self._tools.values()
        ]
