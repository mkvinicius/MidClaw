"""
MidClaw Simulation Runner — in-process threat actor simulation via LLM
No subprocess/IPC. Uses Python brain layer directly.
Pattern from MiroFish swarm, adapted for security with MITRE ATT&CK.
"""

from __future__ import annotations
import asyncio
from dataclasses import dataclass, field
from typing import Any
from .profiles import ThreatActorProfile, get_profile
from .mitre import Technique, get_kill_chain
from .report import SimulationReport, SimulationStep, build_report


@dataclass
class SimulationConfig:
    scenario: str                    # Natural language scenario description
    target_environment: str          # e.g. "corporate Windows network", "Linux web server"
    actor: str | ThreatActorProfile  # Profile name or object
    max_steps: int = 8               # Max attack steps to simulate
    defender_level: str = "average"  # "novice", "average", "expert"
    include_mitigations: bool = True
    model: str = ""


@dataclass
class SimulationState:
    step: int = 0
    foothold: bool = False
    persistence: bool = False
    elevated: bool = False
    lateral_spread: int = 0      # number of pivoted systems
    data_exfiltrated: bool = False
    detected: bool = False
    blocked: bool = False
    notes: list[str] = field(default_factory=list)


async def run_simulation(config: SimulationConfig) -> SimulationReport:
    """
    Run a full threat simulation and return a structured report.
    Each step uses the LLM to realistically narrate what the actor does.
    """
    from brain.agent import chat  # type: ignore

    # Resolve actor profile
    if isinstance(config.actor, str):
        profile = get_profile(config.actor)
        if not profile:
            raise ValueError(f"Unknown threat actor: {config.actor}. Use one of: {', '.join(['apt29', 'apt41', 'lazarus', 'fin7', 'generic-ransomware', 'script-kiddie'])}")
    else:
        profile = config.actor

    kill_chain = profile.kill_chain()
    state = SimulationState()
    steps: list[SimulationStep] = []

    system_prompt = f"""You are simulating a realistic cyberattack for a security training exercise.
Actor: {profile.name} ({profile.sophistication} sophistication, motivation: {profile.motivation})
Target: {config.target_environment}
Scenario: {config.scenario}
Defender Level: {config.defender_level}

For each step, describe:
1. What the attacker does (specific technique, tool, or action)
2. Whether the defender detects it (based on defender level and technique stealth)
3. Whether the step succeeds
4. What artifacts or indicators are created

Be realistic and educational. Use MITRE ATT&CK terminology.
Output as JSON: {{"action": str, "technique_id": str, "success": bool, "detected": bool, "narrative": str, "iocs": list[str]}}"""

    conversation: list[dict] = []

    for i, technique in enumerate(kill_chain[:config.max_steps]):
        if state.blocked:
            break

        user_msg = {
            "role": "user",
            "content": (
                f"Step {i+1}: The actor attempts {technique.name} ({technique.id}).\n"
                f"Current state: foothold={state.foothold}, elevated={state.elevated}, "
                f"lateral_spread={state.lateral_spread}, detected={state.detected}\n"
                "What happens?"
            )
        }
        conversation.append(user_msg)

        try:
            response = chat(conversation, system=system_prompt, model=config.model)
            conversation.append({"role": "assistant", "content": response})

            # Parse JSON from response
            import json, re
            json_match = re.search(r'\{[^}]+\}', response, re.DOTALL)
            if json_match:
                step_data = json.loads(json_match.group())
            else:
                step_data = {
                    "action": f"Execute {technique.name}",
                    "technique_id": technique.id,
                    "success": True,
                    "detected": False,
                    "narrative": response[:500],
                    "iocs": [],
                }

            # Update state
            success = step_data.get("success", True)
            detected = step_data.get("detected", False)

            if detected:
                state.detected = True
                if config.defender_level == "expert":
                    state.blocked = True

            if success:
                if technique.tactic == "initial-access":
                    state.foothold = True
                elif technique.tactic == "privilege-escalation":
                    state.elevated = True
                elif technique.tactic == "lateral-movement":
                    state.lateral_spread += 1
                elif technique.tactic == "persistence":
                    state.persistence = True
                elif technique.tactic == "exfiltration":
                    state.data_exfiltrated = True

            steps.append(SimulationStep(
                step_number=i + 1,
                technique=technique,
                action=step_data.get("action", f"Execute {technique.name}"),
                narrative=step_data.get("narrative", ""),
                success=success,
                detected=detected,
                iocs=step_data.get("iocs", []),
            ))

        except Exception as e:
            steps.append(SimulationStep(
                step_number=i + 1,
                technique=technique,
                action=f"Execute {technique.name}",
                narrative=f"[Simulation error: {e}]",
                success=False,
                detected=False,
                iocs=[],
            ))

        state.step += 1
        await asyncio.sleep(0)  # yield control

    return build_report(config, profile, steps, state)
