/**
 * MidClaw ContextInjector hook — BeforeLLM → WikiRAG → prepend vault context
 * Implements LLMInterceptor (tier: interceptor)
 */

import type { LLMInterceptor, LLMInput, HookContext, HookResult } from "../../core/hooks.js";
import type { VaultStore } from "../../vault/store.js";
import { WikiRAG } from "../../vault/rag.js";

export interface ContextInjectorOptions {
  /** Max tokens to inject from vault (default: 3000) */
  maxTokens?: number;
  /** Max graph traversal depth (default: 2) */
  graphDepth?: number;
  /** Only inject when last user message has at least N chars (default: 10) */
  minQueryLength?: number;
}

export class ContextInjectorHook implements LLMInterceptor {
  readonly tier = "interceptor" as const;

  private rag: WikiRAG;
  private opts: Required<ContextInjectorOptions>;

  constructor(vault: VaultStore, opts: ContextInjectorOptions = {}) {
    this.rag = new WikiRAG(vault);
    this.opts = {
      maxTokens: opts.maxTokens ?? 3000,
      graphDepth: opts.graphDepth ?? 2,
      minQueryLength: opts.minQueryLength ?? 10,
    };
  }

  async onLLMBefore(input: LLMInput, _ctx: HookContext): Promise<HookResult> {
    // Extract last user message as query
    const lastUser = [...input.messages].reverse().find(m => m.role === "user");
    if (!lastUser || lastUser.content.length < this.opts.minQueryLength) {
      return { action: "continue" };
    }

    try {
      const ragCtx = await this.rag.buildContext(lastUser.content, {
        maxTokens: this.opts.maxTokens,
        traversalDepth: this.opts.graphDepth,
      });

      if (ragCtx.notes.length === 0) {
        return { action: "continue" };
      }

      // Inject vault context into system prompt
      const enhanced: LLMInput = {
        ...input,
        system: `${input.system ?? ""}\n\n${ragCtx.context_block}`.trim(),
      };

      return { action: "modify", modified: enhanced };
    } catch (err) {
      console.error("[ContextInjector] RAG error:", err);
      return { action: "continue" };
    }
  }
}
