/**
 * MidClaw ToolApprover hook — whitelist/blacklist/scope + human approval gate
 * Implements ToolApprover interface from HookManager
 */

import type { ToolApprover, ToolCallInput, HookContext, HookResult } from "../../core/hooks.js";
import { scanToolArgs } from "../scanner.js";

export interface ApprovalPolicy {
  /** Tools that are always allowed without checks */
  whitelist?: string[];
  /** Tools that are always denied */
  blacklist?: string[];
  /** Tools that require human confirmation */
  requireConfirmation?: string[];
  /** Max allowed string length in any arg value */
  maxArgLength?: number;
  /** Block if security scanner detects threats in args */
  blockOnThreat?: boolean;
}

export type ConfirmationCallback = (
  tool: string,
  args: Record<string, unknown>,
  ctx: HookContext
) => Promise<boolean>;

const DEFAULT_POLICY: Required<ApprovalPolicy> = {
  whitelist: ["vault_search", "vault_read", "get_time", "echo"],
  blacklist: ["system_shutdown", "format_disk", "drop_database"],
  requireConfirmation: ["shell_exec", "file_write", "web_request", "code_exec"],
  maxArgLength: 4096,
  blockOnThreat: true,
};

export class ToolApproverHook implements ToolApprover {
  readonly tier = "approval" as const;

  private policy: Required<ApprovalPolicy>;
  private confirmFn?: ConfirmationCallback;

  constructor(policy: ApprovalPolicy = {}, confirmFn?: ConfirmationCallback) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.confirmFn = confirmFn;
  }

  async onToolBefore(input: ToolCallInput, ctx: HookContext): Promise<HookResult> {
    const { name, args } = input;

    // 1. Whitelist — always pass
    if (this.policy.whitelist.includes(name)) {
      return { action: "continue" };
    }

    // 2. Blacklist — always deny
    if (this.policy.blacklist.includes(name)) {
      return {
        action: "deny_tool",
        reason: `Tool "${name}" is blacklisted by policy`,
      };
    }

    // 3. Arg length check
    if (this.policy.maxArgLength > 0) {
      for (const [key, val] of Object.entries(args)) {
        if (typeof val === "string" && val.length > this.policy.maxArgLength) {
          return {
            action: "deny_tool",
            reason: `Arg "${key}" exceeds max length ${this.policy.maxArgLength}`,
          };
        }
      }
    }

    // 4. Security scan on args
    if (this.policy.blockOnThreat) {
      const scan = scanToolArgs(args);
      if (!scan.clean) {
        const summary = scan.threats.map(t => t.pattern).join(", ");
        return {
          action: "deny_tool",
          reason: `Security threat in args: ${summary}`,
        };
      }
    }

    // 5. Human confirmation gate
    if (this.policy.requireConfirmation.includes(name)) {
      if (!this.confirmFn) {
        // No confirmation callback — deny by default
        return {
          action: "deny_tool",
          reason: `Tool "${name}" requires human confirmation but no callback is registered`,
        };
      }

      const approved = await this.confirmFn(name, args, ctx);
      if (!approved) {
        return {
          action: "deny_tool",
          reason: `Tool "${name}" denied by human operator`,
        };
      }
    }

    return { action: "continue" };
  }
}
