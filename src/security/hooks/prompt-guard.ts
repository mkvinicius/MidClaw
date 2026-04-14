/**
 * MidClaw PromptGuard hook — scans incoming messages for injection attacks
 * Implements LLMInterceptor (tier: interceptor)
 */

import type { LLMInterceptor, LLMInput, HookContext, HookResult } from "../../core/hooks.js";
import { scanMessages } from "../scanner.js";
import type { EventBus } from "../../core/eventbus.js";

export class PromptGuardHook implements LLMInterceptor {
  readonly tier = "interceptor" as const;

  private bus?: EventBus;
  private blockOnHighSeverity: boolean;

  constructor(opts: { bus?: EventBus; blockOnHighSeverity?: boolean } = {}) {
    this.bus = opts.bus;
    this.blockOnHighSeverity = opts.blockOnHighSeverity ?? true;
  }

  async onLLMBefore(input: LLMInput, ctx: HookContext): Promise<HookResult> {
    const scan = scanMessages(input.messages);

    if (scan.clean) return { action: "continue" };

    const highSeverity = scan.threats.some(t => t.severity === "high");

    this.bus?.emit("alert.security", {
      type: "prompt_injection_attempt",
      threats: scan.threats.map(t => ({ type: t.type, pattern: t.pattern, severity: t.severity })),
      sessionKey: ctx.sessionKey,
    }, { sessionKey: ctx.sessionKey, agentId: ctx.agentId });

    console.warn(`[PromptGuard] ${scan.threats.length} threat(s) detected in session ${ctx.sessionKey}`);

    if (this.blockOnHighSeverity && highSeverity) {
      return {
        action: "respond",
        response: "I detected a potential prompt injection attempt in your message and cannot process it.",
        reason: scan.threats.map(t => t.pattern).join(", "),
      };
    }

    return { action: "continue" };
  }
}
