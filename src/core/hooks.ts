/**
 * MidClaw HookManager — zero-trust tool/LLM interception
 * Pattern from PicoClaw HookManager (pkg/agent/hooks.go)
 *
 * Hook actions:
 *   continue      — pass through unchanged
 *   modify        — replace input/output with modified version
 *   respond       — short-circuit with a canned response
 *   deny_tool     — block tool execution
 *   abort_turn    — graceful turn abort
 *   hard_abort    — immediate session termination
 *
 * Timeout tiers:
 *   observer   500ms  — fire-and-forget metrics/logging
 *   interceptor 5s    — can mutate or block
 *   approval   60s    — human-in-the-loop gate
 */

import { EventBus } from "./eventbus.js";

export type HookAction =
  | "continue"
  | "modify"
  | "respond"
  | "deny_tool"
  | "abort_turn"
  | "hard_abort";

export type HookTier = "observer" | "interceptor" | "approval";

export interface HookContext {
  sessionKey: string;
  agentId?: string;
  turnId: string;
  subDepth: number;
}

export interface ToolCallInput {
  name: string;
  args: Record<string, unknown>;
}

export interface ToolCallOutput {
  name: string;
  result: unknown;
  error?: string;
  durationMs: number;
}

export interface LLMInput {
  messages: Array<{ role: string; content: string }>;
  system?: string;
  model: string;
  tools?: string[];
}

export interface LLMOutput {
  content: string;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
}

export interface HookResult {
  action: HookAction;
  modified?: unknown;        // for "modify" — the replacement value
  response?: string;         // for "respond"
  reason?: string;           // for deny/abort — shown in logs
}

// ─── Interfaces for hook implementors ────────────────────────────────────────

export interface EventObserver {
  tier: "observer";
  onToolBefore?(input: ToolCallInput, ctx: HookContext): void | Promise<void>;
  onToolAfter?(output: ToolCallOutput, ctx: HookContext): void | Promise<void>;
  onLLMBefore?(input: LLMInput, ctx: HookContext): void | Promise<void>;
  onLLMAfter?(output: LLMOutput, ctx: HookContext): void | Promise<void>;
}

export interface LLMInterceptor {
  tier: "interceptor";
  onLLMBefore?(input: LLMInput, ctx: HookContext): Promise<HookResult>;
  onLLMAfter?(output: LLMOutput, ctx: HookContext): Promise<HookResult>;
}

export interface ToolInterceptor {
  tier: "interceptor";
  onToolBefore?(input: ToolCallInput, ctx: HookContext): Promise<HookResult>;
  onToolAfter?(output: ToolCallOutput, ctx: HookContext): Promise<HookResult>;
}

export interface ToolApprover {
  tier: "approval";
  onToolBefore(input: ToolCallInput, ctx: HookContext): Promise<HookResult>;
}

export type AnyHook = EventObserver | LLMInterceptor | ToolInterceptor | ToolApprover;

// ─── Timeout helpers ──────────────────────────────────────────────────────────

const TIER_TIMEOUTS: Record<HookTier, number> = {
  observer: 500,
  interceptor: 5_000,
  approval: 60_000,
};

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }).catch(() => resolve(fallback));
  });
}

// ─── HookManager ─────────────────────────────────────────────────────────────

export class HookManager {
  private hooks: AnyHook[] = [];
  private bus?: EventBus;

  constructor(bus?: EventBus) {
    this.bus = bus;
  }

  register(hook: AnyHook): void {
    this.hooks.push(hook);
  }

  unregister(hook: AnyHook): void {
    const idx = this.hooks.indexOf(hook);
    if (idx !== -1) this.hooks.splice(idx, 1);
  }

  // ─── Tool lifecycle ─────────────────────────────────────────────────────

  async runToolBefore(input: ToolCallInput, ctx: HookContext): Promise<HookResult> {
    this.bus?.emit("tool.before", { tool: input.name, args: input.args }, { sessionKey: ctx.sessionKey, agentId: ctx.agentId });

    // Observers (fire and forget)
    for (const h of this.hooks) {
      if (h.tier === "observer" && "onToolBefore" in h && h.onToolBefore) {
        Promise.resolve(h.onToolBefore(input, ctx)).catch(err =>
          console.error("[HookManager] observer error:", err)
        );
      }
    }

    // Interceptors (sequential, can block)
    for (const h of this.hooks) {
      if (h.tier === "interceptor" && "onToolBefore" in h && h.onToolBefore) {
        const result = await withTimeout(
          h.onToolBefore(input, ctx),
          TIER_TIMEOUTS.interceptor,
          { action: "continue" as HookAction }
        );
        if (result.action !== "continue") return result;
        if (result.modified) input = result.modified as ToolCallInput;
      }
    }

    // Approvers (last, human-in-the-loop)
    for (const h of this.hooks) {
      if (h.tier === "approval" && "onToolBefore" in h) {
        const result = await withTimeout(
          (h as ToolApprover).onToolBefore(input, ctx),
          TIER_TIMEOUTS.approval,
          { action: "deny_tool" as HookAction, reason: "approval timeout" }
        );
        if (result.action !== "continue") return result;
      }
    }

    return { action: "continue", modified: input };
  }

  async runToolAfter(output: ToolCallOutput, ctx: HookContext): Promise<HookResult> {
    this.bus?.emit("tool.after", { tool: output.name, durationMs: output.durationMs, error: output.error }, { sessionKey: ctx.sessionKey, agentId: ctx.agentId });

    for (const h of this.hooks) {
      if (h.tier === "observer" && "onToolAfter" in h && h.onToolAfter) {
        Promise.resolve(h.onToolAfter(output, ctx)).catch(err =>
          console.error("[HookManager] observer error:", err)
        );
      }
    }

    for (const h of this.hooks) {
      if (h.tier === "interceptor" && "onToolAfter" in h && h.onToolAfter) {
        const result = await withTimeout(
          h.onToolAfter(output, ctx),
          TIER_TIMEOUTS.interceptor,
          { action: "continue" as HookAction }
        );
        if (result.action !== "continue") return result;
        if (result.modified) output = result.modified as ToolCallOutput;
      }
    }

    return { action: "continue", modified: output };
  }

  // ─── LLM lifecycle ──────────────────────────────────────────────────────

  async runLLMBefore(input: LLMInput, ctx: HookContext): Promise<HookResult> {
    this.bus?.emit("llm.before", { model: input.model, tools: input.tools }, { sessionKey: ctx.sessionKey, agentId: ctx.agentId });

    for (const h of this.hooks) {
      if (h.tier === "observer" && "onLLMBefore" in h && h.onLLMBefore) {
        Promise.resolve(h.onLLMBefore(input, ctx)).catch(err =>
          console.error("[HookManager] observer error:", err)
        );
      }
    }

    for (const h of this.hooks) {
      if (h.tier === "interceptor" && "onLLMBefore" in h && (h as LLMInterceptor).onLLMBefore) {
        const result = await withTimeout(
          (h as LLMInterceptor).onLLMBefore!(input, ctx),
          TIER_TIMEOUTS.interceptor,
          { action: "continue" as HookAction }
        );
        if (result.action !== "continue") return result;
        if (result.modified) input = result.modified as LLMInput;
      }
    }

    return { action: "continue", modified: input };
  }

  async runLLMAfter(output: LLMOutput, ctx: HookContext): Promise<HookResult> {
    this.bus?.emit("llm.after", { stopReason: output.stopReason, inputTokens: output.inputTokens, outputTokens: output.outputTokens }, { sessionKey: ctx.sessionKey, agentId: ctx.agentId });

    for (const h of this.hooks) {
      if (h.tier === "observer" && "onLLMAfter" in h && h.onLLMAfter) {
        Promise.resolve(h.onLLMAfter(output, ctx)).catch(err =>
          console.error("[HookManager] observer error:", err)
        );
      }
    }

    for (const h of this.hooks) {
      if (h.tier === "interceptor" && "onLLMAfter" in h && (h as LLMInterceptor).onLLMAfter) {
        const result = await withTimeout(
          (h as LLMInterceptor).onLLMAfter!(output, ctx),
          TIER_TIMEOUTS.interceptor,
          { action: "continue" as HookAction }
        );
        if (result.action !== "continue") return result;
        if (result.modified) output = result.modified as LLMOutput;
      }
    }

    return { action: "continue", modified: output };
  }
}
