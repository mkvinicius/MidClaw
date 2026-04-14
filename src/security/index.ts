export { AuditReportBuilder, reportSummary, severityScore } from "./audit.js";
export type { SecurityFinding, SecurityAuditReport, FindingSeverity } from "./audit.js";

export { scanText, scanMessages, scanToolArgs } from "./scanner.js";
export type { ScanResult, ThreatMatch, ThreatType } from "./scanner.js";

export { ToolApproverHook } from "./hooks/approval.js";
export type { ApprovalPolicy, ConfirmationCallback } from "./hooks/approval.js";

export { VaultLoggerHook } from "./hooks/vault-logger.js";
export { ContextInjectorHook } from "./hooks/context-injector.js";
export { PromptGuardHook } from "./hooks/prompt-guard.js";
