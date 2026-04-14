"""
MidClaw Simulation Report — structured output + vault note generation
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .runner import SimulationConfig, SimulationState
    from .profiles import ThreatActorProfile
    from .mitre import Technique


@dataclass
class SimulationStep:
    step_number: int
    technique: "Technique"
    action: str
    narrative: str
    success: bool
    detected: bool
    iocs: list[str] = field(default_factory=list)


@dataclass
class SimulationReport:
    scenario: str
    actor: str
    target_environment: str
    steps: list[SimulationStep]
    final_state: dict[str, Any]
    outcome: str           # "success", "partial", "blocked", "detected"
    risk_score: int        # 0-100
    findings: list[str]
    mitigations: list[str]
    all_iocs: list[str]
    techniques_used: list[str]

    def to_markdown(self) -> str:
        lines = [
            f"# Simulation Report: {self.scenario}",
            f"\n**Actor:** {self.actor}",
            f"**Target:** {self.target_environment}",
            f"**Outcome:** {self.outcome}",
            f"**Risk Score:** {self.risk_score}/100\n",
            "## Attack Steps\n",
        ]

        for step in self.steps:
            status = "SUCCESS" if step.success else "FAILED"
            detect = " [DETECTED]" if step.detected else ""
            lines.append(f"### Step {step.step_number}: {step.technique.name} ({step.technique.id})")
            lines.append(f"**Status:** {status}{detect}")
            lines.append(f"\n{step.narrative}\n")
            if step.iocs:
                lines.append("**IOCs:** " + ", ".join(f"`{ioc}`" for ioc in step.iocs))
            lines.append("")

        if self.findings:
            lines.append("## Key Findings\n")
            for f in self.findings:
                lines.append(f"- {f}")
            lines.append("")

        if self.mitigations:
            lines.append("## Recommended Mitigations\n")
            for m in self.mitigations:
                lines.append(f"- {m}")
            lines.append("")

        if self.all_iocs:
            lines.append("## All Indicators of Compromise\n```")
            lines.extend(self.all_iocs)
            lines.append("```\n")

        return "\n".join(lines)

    def summary(self) -> str:
        successful = sum(1 for s in self.steps if s.success)
        detected = sum(1 for s in self.steps if s.detected)
        return (
            f"Simulation '{self.scenario}': {successful}/{len(self.steps)} steps succeeded, "
            f"{detected} detected. Outcome: {self.outcome}. Risk: {self.risk_score}/100."
        )


def calculate_risk_score(steps: list["SimulationStep"], state: "SimulationState") -> int:
    score = 0
    successful = [s for s in steps if s.success]

    score += len(successful) * 8
    if state.foothold:
        score += 15
    if state.elevated:
        score += 20
    if state.persistence:
        score += 15
    if state.lateral_spread > 0:
        score += min(state.lateral_spread * 10, 20)
    if state.data_exfiltrated:
        score += 25
    if not state.detected:
        score += 10  # bonus for staying hidden

    return min(score, 100)


def build_report(
    config: "SimulationConfig",
    profile: "ThreatActorProfile",
    steps: list["SimulationStep"],
    state: "SimulationState",
) -> SimulationReport:
    # Determine outcome
    if state.blocked:
        outcome = "blocked"
    elif state.detected and not state.data_exfiltrated:
        outcome = "detected"
    elif state.data_exfiltrated or state.lateral_spread > 2:
        outcome = "success"
    else:
        outcome = "partial"

    # Collect all IOCs
    all_iocs: list[str] = []
    for step in steps:
        all_iocs.extend(step.iocs)
    all_iocs = list(set(all_iocs))

    # Build findings
    findings = []
    if state.foothold:
        findings.append(f"Actor established foothold in {config.target_environment}")
    if state.elevated:
        findings.append("Privilege escalation achieved — actor gained elevated access")
    if state.persistence:
        findings.append("Persistence mechanisms installed — actor can survive reboot")
    if state.lateral_spread > 0:
        findings.append(f"Lateral movement to {state.lateral_spread} additional system(s)")
    if state.data_exfiltrated:
        findings.append("Data exfiltration confirmed — sensitive information at risk")
    if state.detected:
        findings.append("Attack partially detected by defenders")
    if not findings:
        findings.append("Attack unsuccessful — all steps blocked or failed")

    # Collect mitigations from all techniques used
    mitigations: list[str] = []
    seen: set[str] = set()
    for step in steps:
        for m in step.technique.mitigations:
            if m not in seen:
                mitigations.append(f"{m} (counters {step.technique.id})")
                seen.add(m)

    risk_score = calculate_risk_score(steps, state)
    techniques_used = [s.technique.id for s in steps if s.success]

    return SimulationReport(
        scenario=config.scenario,
        actor=profile.name,
        target_environment=config.target_environment,
        steps=steps,
        final_state={
            "foothold": state.foothold,
            "persistence": state.persistence,
            "elevated": state.elevated,
            "lateral_spread": state.lateral_spread,
            "data_exfiltrated": state.data_exfiltrated,
            "detected": state.detected,
            "blocked": state.blocked,
        },
        outcome=outcome,
        risk_score=risk_score,
        findings=findings,
        mitigations=mitigations,
        all_iocs=all_iocs,
        techniques_used=techniques_used,
    )
