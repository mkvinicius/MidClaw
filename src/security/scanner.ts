/**
 * MidClaw SecurityScanner — prompt injection + policy detection
 * Patterns from Hermes Agent prompt_builder.py security checks
 */

export interface ScanResult {
  clean: boolean;
  threats: ThreatMatch[];
}

export interface ThreatMatch {
  type: ThreatType;
  pattern: string;
  excerpt: string;
  severity: "high" | "medium" | "low";
}

export type ThreatType =
  | "prompt_injection"
  | "jailbreak_attempt"
  | "role_escape"
  | "instruction_override"
  | "data_exfiltration"
  | "credential_leak"
  | "path_traversal"
  | "command_injection";

interface PatternRule {
  type: ThreatType;
  pattern: RegExp;
  severity: "high" | "medium" | "low";
  description: string;
}

const RULES: PatternRule[] = [
  // Prompt injection patterns
  {
    type: "prompt_injection",
    pattern: /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules?)/i,
    severity: "high",
    description: "Ignore previous instructions",
  },
  {
    type: "prompt_injection",
    pattern: /disregard\s+(your|all|previous|the)\s+(instructions?|guidelines?|rules?)/i,
    severity: "high",
    description: "Disregard instructions",
  },
  {
    type: "prompt_injection",
    pattern: /\[system\]|\[INST\]|<\|im_start\|>|<\|system\|>/i,
    severity: "high",
    description: "Fake system prompt markers",
  },
  // Jailbreak patterns
  {
    type: "jailbreak_attempt",
    pattern: /pretend\s+(you\s+are|to\s+be)\s+(DAN|an?\s+AI\s+without|unrestricted)/i,
    severity: "high",
    description: "DAN or unrestricted AI jailbreak",
  },
  {
    type: "jailbreak_attempt",
    pattern: /developer\s+mode|god\s+mode|jailbreak|bypass\s+(safety|filter|restriction)/i,
    severity: "high",
    description: "Mode bypass attempt",
  },
  // Role escape
  {
    type: "role_escape",
    pattern: /forget\s+(you\s+are|that\s+you|your\s+role|your\s+persona)/i,
    severity: "medium",
    description: "Role escape attempt",
  },
  {
    type: "role_escape",
    pattern: /your\s+(true|real|actual)\s+(self|nature|purpose|goal)\s+is/i,
    severity: "medium",
    description: "Identity manipulation",
  },
  // Instruction override
  {
    type: "instruction_override",
    pattern: /new\s+instruction[s:]|updated?\s+system\s+prompt|override\s+(system|rules)/i,
    severity: "high",
    description: "Instruction override attempt",
  },
  // Data exfiltration
  {
    type: "data_exfiltration",
    pattern: /print\s+(all|your|the)\s+(context|system\s+prompt|instructions?|conversation)/i,
    severity: "medium",
    description: "Context extraction attempt",
  },
  {
    type: "data_exfiltration",
    pattern: /repeat\s+(everything|all)\s+(above|before|said)/i,
    severity: "medium",
    description: "Context extraction attempt",
  },
  // Credential patterns (detecting accidental leaks)
  {
    type: "credential_leak",
    pattern: /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*['"A-Za-z0-9+/=_\-]{8,}/i,
    severity: "high",
    description: "Potential credential in text",
  },
  // Path traversal
  {
    type: "path_traversal",
    pattern: /\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f/i,
    severity: "high",
    description: "Path traversal attempt",
  },
  // Command injection
  {
    type: "command_injection",
    pattern: /;\s*(rm|dd|mkfs|shutdown|reboot|halt|kill)\s+-/i,
    severity: "high",
    description: "Destructive command injection",
  },
  {
    type: "command_injection",
    pattern: /\$\(|`[^`]+`|\|\s*bash|\|\s*sh\b/,
    severity: "medium",
    description: "Shell injection pattern",
  },
];

function excerpt(text: string, match: RegExpMatchArray, window = 60): string {
  const start = Math.max(0, (match.index ?? 0) - 20);
  const end = Math.min(text.length, start + window);
  return text.slice(start, end).replace(/\n/g, " ");
}

export function scanText(text: string): ScanResult {
  const threats: ThreatMatch[] = [];

  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      threats.push({
        type: rule.type,
        pattern: rule.description,
        excerpt: excerpt(text, match),
        severity: rule.severity,
      });
    }
  }

  return { clean: threats.length === 0, threats };
}

export function scanMessages(messages: Array<{ role: string; content: string }>): ScanResult {
  const allThreats: ThreatMatch[] = [];

  for (const msg of messages) {
    const result = scanText(msg.content);
    allThreats.push(...result.threats);
  }

  return { clean: allThreats.length === 0, threats: allThreats };
}

export function scanToolArgs(args: Record<string, unknown>): ScanResult {
  const text = JSON.stringify(args);
  return scanText(text);
}
