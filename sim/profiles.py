"""
MidClaw Threat Actor Profiles — generated from vault data (no Zep required)
Pattern from MiroFish agent profiles, adapted for MITRE ATT&CK.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any
from .mitre import Technique, get_technique, get_kill_chain


@dataclass
class ThreatActorProfile:
    name: str
    aliases: list[str]
    origin: str                   # e.g. "Russia", "China", "Unknown"
    motivation: str               # e.g. "espionage", "financial", "hacktivism"
    sophistication: str           # "novice", "intermediate", "advanced", "nation-state"
    techniques: list[str]         # MITRE T-IDs
    preferred_platforms: list[str]
    description: str
    iocs: list[str] = field(default_factory=list)
    references: list[str] = field(default_factory=list)

    def kill_chain(self) -> list[Technique]:
        return get_kill_chain(self.techniques)

    def to_sim_context(self) -> dict[str, Any]:
        return {
            "actor": self.name,
            "aliases": self.aliases,
            "origin": self.origin,
            "motivation": self.motivation,
            "sophistication": self.sophistication,
            "techniques": self.techniques,
            "platforms": self.preferred_platforms,
        }


# ─── Built-in Threat Actor Profiles ──────────────────────────────────────────

BUILTIN_PROFILES: dict[str, ThreatActorProfile] = {
    "apt29": ThreatActorProfile(
        name="APT29",
        aliases=["Cozy Bear", "The Dukes", "YTTRIUM"],
        origin="Russia",
        motivation="espionage",
        sophistication="nation-state",
        techniques=["T1566.001", "T1078", "T1059.001", "T1027", "T1071.001", "T1041"],
        preferred_platforms=["Windows"],
        description="Russian state-sponsored group known for targeting government and diplomatic organizations.",
    ),
    "apt41": ThreatActorProfile(
        name="APT41",
        aliases=["Double Dragon", "Winnti", "Barium"],
        origin="China",
        motivation="espionage and financial",
        sophistication="nation-state",
        techniques=["T1190", "T1059.001", "T1055", "T1078", "T1486", "T1560"],
        preferred_platforms=["Windows", "Linux"],
        description="Chinese state-sponsored group conducting both espionage and financially motivated operations.",
    ),
    "lazarus": ThreatActorProfile(
        name="Lazarus Group",
        aliases=["Hidden Cobra", "ZINC", "Bureau 121"],
        origin="North Korea",
        motivation="financial and espionage",
        sophistication="advanced",
        techniques=["T1566.001", "T1059.003", "T1486", "T1041", "T1110"],
        preferred_platforms=["Windows"],
        description="North Korean group known for bank heists and ransomware deployment.",
    ),
    "fin7": ThreatActorProfile(
        name="FIN7",
        aliases=["Carbanak", "Carbon Spider"],
        origin="Unknown (Eastern Europe suspected)",
        motivation="financial",
        sophistication="advanced",
        techniques=["T1566.001", "T1059.001", "T1547.001", "T1003.001", "T1041"],
        preferred_platforms=["Windows"],
        description="Financially motivated group targeting point-of-sale systems and financial institutions.",
    ),
    "generic-ransomware": ThreatActorProfile(
        name="Generic Ransomware Actor",
        aliases=["RansomGroup"],
        origin="Unknown",
        motivation="financial",
        sophistication="intermediate",
        techniques=["T1566.002", "T1133", "T1078", "T1021.001", "T1486", "T1490"],
        preferred_platforms=["Windows"],
        description="Typical ransomware-as-a-service affiliate targeting enterprise networks.",
    ),
    "script-kiddie": ThreatActorProfile(
        name="Script Kiddie",
        aliases=["Opportunist"],
        origin="Unknown",
        motivation="vandalism or experimentation",
        sophistication="novice",
        techniques=["T1190", "T1110", "T1059.004"],
        preferred_platforms=["Linux", "Windows"],
        description="Low-sophistication attacker using existing tools without deep technical knowledge.",
    ),
}


def get_profile(name: str) -> ThreatActorProfile | None:
    return BUILTIN_PROFILES.get(name.lower().replace(" ", "-"))


def list_profiles() -> list[str]:
    return list(BUILTIN_PROFILES.keys())


def profile_from_vault_data(data: dict[str, Any]) -> ThreatActorProfile:
    """Build a profile from vault note data (e.g. from threat-actors/ notes)."""
    return ThreatActorProfile(
        name=data.get("name", "Unknown"),
        aliases=data.get("aliases", []),
        origin=data.get("origin", "Unknown"),
        motivation=data.get("motivation", "unknown"),
        sophistication=data.get("sophistication", "intermediate"),
        techniques=data.get("techniques", []),
        preferred_platforms=data.get("platforms", ["Windows"]),
        description=data.get("description", ""),
        iocs=data.get("iocs", []),
        references=data.get("references", []),
    )
