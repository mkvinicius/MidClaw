"""
MidClaw MITRE ATT&CK local taxonomy
Replaces MiroFish's Twitter/Reddit action taxonomy with security-relevant TTPs.

This is a curated subset — for full ATT&CK data, integrate with MITRE's STIX API.
"""

from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class Technique:
    id: str                      # e.g. "T1059.001"
    name: str
    tactic: str                  # e.g. "execution"
    description: str
    platforms: list[str] = field(default_factory=list)
    data_sources: list[str] = field(default_factory=list)
    mitigations: list[str] = field(default_factory=list)
    subtechniques: list[str] = field(default_factory=list)


# ─── Curated ATT&CK Technique Catalog ────────────────────────────────────────

TECHNIQUES: dict[str, Technique] = {
    # Initial Access
    "T1566.001": Technique("T1566.001", "Spearphishing Attachment", "initial-access",
        "Adversaries may send spearphishing emails with malicious attachments.",
        ["Windows", "macOS", "Linux"], ["Email", "File"], ["User training", "Anti-phishing"]),
    "T1566.002": Technique("T1566.002", "Spearphishing Link", "initial-access",
        "Adversaries may send spearphishing emails with malicious links.",
        ["Windows", "macOS", "Linux"], ["Email", "Network Traffic"], ["User training"]),
    "T1190": Technique("T1190", "Exploit Public-Facing Application", "initial-access",
        "Adversaries may attempt to take advantage of a weakness in an Internet-facing host.",
        ["Windows", "Linux", "macOS"], ["Network Traffic", "Application Log"], ["WAF", "Patching"]),
    "T1133": Technique("T1133", "External Remote Services", "initial-access",
        "Adversaries may leverage external-facing remote services to gain initial access.",
        ["Windows", "Linux"], ["Network Traffic"], ["MFA", "VPN hardening"]),

    # Execution
    "T1059.001": Technique("T1059.001", "PowerShell", "execution",
        "Adversaries may abuse PowerShell commands and scripts.",
        ["Windows"], ["Command History", "Process Monitoring"], ["Constrained Language Mode", "AMSI"]),
    "T1059.003": Technique("T1059.003", "Windows Command Shell", "execution",
        "Adversaries may abuse the Windows command shell for execution.",
        ["Windows"], ["Process Monitoring"], ["Execution prevention"]),
    "T1059.004": Technique("T1059.004", "Unix Shell", "execution",
        "Adversaries may abuse Unix shell commands and scripts.",
        ["Linux", "macOS"], ["Command History", "Process Monitoring"], ["Restrict shell access"]),
    "T1203": Technique("T1203", "Exploitation for Client Execution", "execution",
        "Adversaries may exploit software vulnerabilities in client applications.",
        ["Windows", "macOS", "Linux"], ["Process Monitoring"], ["Application isolation", "Patching"]),

    # Persistence
    "T1053.005": Technique("T1053.005", "Scheduled Task", "persistence",
        "Adversaries may abuse the Windows Task Scheduler to perform task scheduling.",
        ["Windows"], ["Scheduled Job", "Process Monitoring"], ["Audit scheduled tasks"]),
    "T1078": Technique("T1078", "Valid Accounts", "persistence",
        "Adversaries may obtain and abuse credentials of existing accounts.",
        ["Windows", "Linux", "macOS", "Cloud"], ["Authentication Logs"], ["MFA", "Privileged Access Management"]),
    "T1547.001": Technique("T1547.001", "Registry Run Keys / Startup Folder", "persistence",
        "Adversaries may achieve persistence by adding a program to a startup folder or as a registry run key.",
        ["Windows"], ["Registry", "File Monitoring"], ["Registry monitoring"]),

    # Privilege Escalation
    "T1055": Technique("T1055", "Process Injection", "privilege-escalation",
        "Adversaries may inject code into processes to evade process-based defenses.",
        ["Windows", "macOS", "Linux"], ["Process Monitoring"], ["Behavior monitoring"]),
    "T1068": Technique("T1068", "Exploitation for Privilege Escalation", "privilege-escalation",
        "Adversaries may exploit software vulnerabilities to elevate privileges.",
        ["Windows", "Linux", "macOS"], ["Process Monitoring"], ["Patching", "Exploit protection"]),

    # Defense Evasion
    "T1027": Technique("T1027", "Obfuscated Files or Information", "defense-evasion",
        "Adversaries may attempt to make payloads difficult to discover.",
        ["Windows", "Linux", "macOS"], ["File Monitoring"], ["Antivirus", "Deobfuscation"]),
    "T1036": Technique("T1036", "Masquerading", "defense-evasion",
        "Adversaries may attempt to manipulate features of their artifacts to make them appear legitimate.",
        ["Windows", "Linux", "macOS"], ["Process Monitoring", "File Monitoring"], ["Code signing"]),

    # Credential Access
    "T1003.001": Technique("T1003.001", "LSASS Memory", "credential-access",
        "Adversaries may attempt to access credential material stored in the process memory of LSASS.",
        ["Windows"], ["Windows Event Logs", "Process Monitoring"], ["Credential Guard", "Protected Users"]),
    "T1110": Technique("T1110", "Brute Force", "credential-access",
        "Adversaries may use brute force techniques to gain access to accounts.",
        ["Windows", "Linux", "macOS", "Cloud"], ["Authentication Logs"], ["Account lockout", "MFA"]),

    # Discovery
    "T1082": Technique("T1082", "System Information Discovery", "discovery",
        "An adversary may attempt to get detailed information about the operating system.",
        ["Windows", "Linux", "macOS"], ["Process Monitoring", "Command History"], ["Monitoring"]),
    "T1046": Technique("T1046", "Network Service Discovery", "discovery",
        "Adversaries may attempt to get a listing of services running on remote hosts.",
        ["Windows", "Linux", "macOS"], ["Network Traffic", "Process Monitoring"], ["Network segmentation"]),
    "T1083": Technique("T1083", "File and Directory Discovery", "discovery",
        "Adversaries may enumerate files and directories.",
        ["Windows", "Linux", "macOS"], ["File Monitoring", "Process Monitoring"], ["Monitoring"]),

    # Lateral Movement
    "T1021.001": Technique("T1021.001", "Remote Desktop Protocol", "lateral-movement",
        "Adversaries may use Valid Accounts to log into a computer using RDP.",
        ["Windows"], ["Network Traffic", "Authentication Logs"], ["MFA", "Network segmentation"]),
    "T1021.002": Technique("T1021.002", "SMB/Windows Admin Shares", "lateral-movement",
        "Adversaries may use Valid Accounts to interact with a remote network share.",
        ["Windows"], ["Network Traffic", "Authentication Logs"], ["Disable admin shares"]),
    "T1550.002": Technique("T1550.002", "Pass the Hash", "lateral-movement",
        "Adversaries may pass the hash using stolen password hashes.",
        ["Windows"], ["Authentication Logs"], ["Credential Guard", "MFA"]),

    # Collection
    "T1560": Technique("T1560", "Archive Collected Data", "collection",
        "An adversary may compress and/or encrypt data before exfiltration.",
        ["Windows", "Linux", "macOS"], ["File Monitoring", "Process Monitoring"], ["DLP"]),
    "T1119": Technique("T1119", "Automated Collection", "collection",
        "Adversaries may use automated techniques for collecting internal data.",
        ["Windows", "Linux", "macOS"], ["File Monitoring"], ["DLP", "Auditing"]),

    # Exfiltration
    "T1041": Technique("T1041", "Exfiltration Over C2 Channel", "exfiltration",
        "Adversaries may steal data by exfiltrating it over an existing command and control channel.",
        ["Windows", "Linux", "macOS"], ["Network Traffic"], ["Network monitoring", "DLP"]),
    "T1048": Technique("T1048", "Exfiltration Over Alternative Protocol", "exfiltration",
        "Adversaries may steal data by exfiltrating it over a different protocol than that of the C2.",
        ["Windows", "Linux", "macOS"], ["Network Traffic"], ["Network monitoring"]),

    # Command and Control
    "T1071.001": Technique("T1071.001", "Web Protocols", "command-and-control",
        "Adversaries may communicate using application layer protocols associated with web traffic.",
        ["Windows", "Linux", "macOS"], ["Network Traffic"], ["Network filtering"]),
    "T1095": Technique("T1095", "Non-Application Layer Protocol", "command-and-control",
        "Adversaries may use a non-application layer protocol for communication between host and C2.",
        ["Windows", "Linux", "macOS"], ["Network Traffic"], ["Network monitoring"]),

    # Impact
    "T1486": Technique("T1486", "Data Encrypted for Impact", "impact",
        "Adversaries may encrypt data on target systems or on large numbers of systems in a network (ransomware).",
        ["Windows", "macOS", "Linux"], ["File Monitoring"], ["Backups", "Endpoint protection"]),
    "T1490": Technique("T1490", "Inhibit System Recovery", "impact",
        "Adversaries may delete or remove built-in operating system data and turn off services.",
        ["Windows", "macOS", "Linux"], ["Windows Event Logs", "Process Monitoring"], ["Backups"]),
}

TACTICS = [
    "initial-access", "execution", "persistence", "privilege-escalation",
    "defense-evasion", "credential-access", "discovery", "lateral-movement",
    "collection", "exfiltration", "command-and-control", "impact",
]


def get_technique(tid: str) -> Technique | None:
    return TECHNIQUES.get(tid)


def get_by_tactic(tactic: str) -> list[Technique]:
    return [t for t in TECHNIQUES.values() if t.tactic == tactic]


def get_kill_chain(techniques: list[str]) -> list[Technique]:
    """Order techniques by tactic phase (kill chain order)."""
    result = []
    for tactic in TACTICS:
        for tid in techniques:
            tech = TECHNIQUES.get(tid)
            if tech and tech.tactic == tactic:
                result.append(tech)
    return result
