"""
MidClaw Simulation CLI
Usage: python sim/cli.py --actor apt29 --scenario "APT espionage campaign" --target "government network"
"""

import argparse
import asyncio
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sim.runner import run_simulation, SimulationConfig
from sim.profiles import list_profiles


def main():
    parser = argparse.ArgumentParser(description="MidClaw Threat Simulation")
    parser.add_argument("--actor", "-a", default="generic-ransomware",
                        help=f"Threat actor profile. Options: {', '.join(list_profiles())}")
    parser.add_argument("--scenario", "-s", default="Generic cyberattack simulation",
                        help="Simulation scenario description")
    parser.add_argument("--target", "-t", default="corporate Windows network",
                        help="Target environment description")
    parser.add_argument("--steps", "-n", type=int, default=6,
                        help="Max attack steps (default: 6)")
    parser.add_argument("--defender", "-d", choices=["novice", "average", "expert"],
                        default="average", help="Defender sophistication level")
    parser.add_argument("--model", "-m", default="",
                        help="LLM model to use (default: from .env)")
    parser.add_argument("--output", "-o", choices=["markdown", "summary", "json"],
                        default="markdown", help="Output format")

    args = parser.parse_args()

    config = SimulationConfig(
        scenario=args.scenario,
        target_environment=args.target,
        actor=args.actor,
        max_steps=args.steps,
        defender_level=args.defender,
        model=args.model,
    )

    print(f"[*] Starting simulation: {args.scenario}")
    print(f"[*] Actor: {args.actor} | Target: {args.target} | Defender: {args.defender}")
    print("[*] Running...\n")

    try:
        report = asyncio.run(run_simulation(config))
    except ValueError as e:
        print(f"[Error] {e}")
        sys.exit(1)

    if args.output == "markdown":
        print(report.to_markdown())
    elif args.output == "summary":
        print(report.summary())
    elif args.output == "json":
        import json
        print(json.dumps({
            "scenario": report.scenario,
            "actor": report.actor,
            "outcome": report.outcome,
            "risk_score": report.risk_score,
            "findings": report.findings,
            "mitigations": report.mitigations,
            "techniques_used": report.techniques_used,
            "iocs": report.all_iocs,
        }, indent=2))


if __name__ == "__main__":
    main()
