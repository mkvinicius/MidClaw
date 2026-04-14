"""
MidClaw SkillRegistry — dynamic skill registration + matching
"""

from __future__ import annotations
import importlib
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base import BaseSkill


class SkillRegistry:
    def __init__(self):
        self._skills: dict[str, "BaseSkill"] = {}
        self._auto_load()

    def _auto_load(self):
        skill_dir = os.path.dirname(__file__)
        for fname in os.listdir(skill_dir):
            if fname.startswith("_") or not fname.endswith(".py"):
                continue
            if fname in ("registry.py", "base.py"):
                continue
            module_name = f"skills.{fname[:-3]}"
            try:
                mod = importlib.import_module(module_name)
                for attr in dir(mod):
                    obj = getattr(mod, attr)
                    if (
                        isinstance(obj, type)
                        and hasattr(obj, "name")
                        and hasattr(obj, "run")
                        and attr != "BaseSkill"
                    ):
                        instance = obj()
                        if instance.name:
                            self._skills[instance.name] = instance
            except Exception as e:
                print(f"[SkillRegistry] failed to load {module_name}: {e}")

    def register(self, skill: "BaseSkill") -> None:
        self._skills[skill.name] = skill

    def get(self, name: str) -> "BaseSkill | None":
        return self._skills.get(name)

    def match(self, text: str) -> "BaseSkill | None":
        """Find the first skill that matches the given text."""
        for skill in self._skills.values():
            if skill.matches(text):
                return skill
        return None

    def list_skills(self) -> list[dict]:
        return [
            {"name": s.name, "description": s.description, "triggers": s.trigger_phrases}
            for s in self._skills.values()
        ]
