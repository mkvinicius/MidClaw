"""
MidClaw Skills — procedural memory for the brain layer
Skills are reusable workflows that chain multiple tools together.
"""

from .base import BaseSkill
from .registry import SkillRegistry

__all__ = ["BaseSkill", "SkillRegistry"]
