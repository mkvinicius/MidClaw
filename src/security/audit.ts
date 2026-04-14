/**
 * MidClaw SecurityAuditReport — structured security findings
 * Based on Hermes Agent security patterns
 */

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface SecurityFinding {
  checkId: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  remediation: string;
  evidence?: string;
  timestamp: number;
}

export interface SecurityAuditReport {
  id: string;
  sessionKey: string;
  agentId?: string;
  startedAt: number;
  completedAt: number;
  findings: SecurityFinding[];
  summary: string;
}

export function severityScore(s: FindingSeverity): number {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[s];
}

export function reportSummary(report: SecurityAuditReport): string {
  const counts: Record<FindingSeverity, number> = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0,
  };
  for (const f of report.findings) counts[f.severity]++;

  const parts: string[] = [];
  for (const [sev, count] of Object.entries(counts)) {
    if (count > 0) parts.push(`${count} ${sev}`);
  }

  return parts.length > 0
    ? `Audit complete: ${parts.join(", ")}`
    : "Audit complete: no findings";
}

export class AuditReportBuilder {
  private findings: SecurityFinding[] = [];
  private startedAt = Date.now();
  private id: string;
  private sessionKey: string;
  private agentId?: string;

  constructor(sessionKey: string, agentId?: string) {
    this.id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessionKey = sessionKey;
    this.agentId = agentId;
  }

  add(finding: Omit<SecurityFinding, "timestamp">): this {
    this.findings.push({ ...finding, timestamp: Date.now() });
    return this;
  }

  build(summary?: string): SecurityAuditReport {
    const report: SecurityAuditReport = {
      id: this.id,
      sessionKey: this.sessionKey,
      agentId: this.agentId,
      startedAt: this.startedAt,
      completedAt: Date.now(),
      findings: [...this.findings],
      summary: summary ?? "",
    };
    report.summary = summary ?? reportSummary(report);
    return report;
  }

  get findingCount(): number {
    return this.findings.length;
  }

  highestSeverity(): FindingSeverity | null {
    if (this.findings.length === 0) return null;
    return this.findings.reduce((best, f) =>
      severityScore(f.severity) > severityScore(best.severity) ? f : best
    ).severity;
  }
}
