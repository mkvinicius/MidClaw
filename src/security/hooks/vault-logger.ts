/**
 * MidClaw VaultLogger hook — AfterTool → extract entities → write vault note
 * Implements EventObserver (tier: observer) from HookManager
 */

import type { EventObserver, ToolCallOutput, HookContext } from "../../core/hooks.js";
import type { VaultStore } from "../../vault/store.js";
import { buildNoteMarkdown } from "../../vault/wikilink.js";

export class VaultLoggerHook implements EventObserver {
  readonly tier = "observer" as const;

  private vault: VaultStore;
  private sessionKey: string;

  constructor(vault: VaultStore, sessionKey: string) {
    this.vault = vault;
    this.sessionKey = sessionKey;
  }

  async onToolAfter(output: ToolCallOutput, ctx: HookContext): Promise<void> {
    if (output.error) return; // don't log failed tools

    // Only log tools that produce meaningful output
    const loggable = ["shell_exec", "web_request", "file_read", "code_exec", "nmap_scan", "whois"];
    if (!loggable.includes(output.name)) return;

    const path = `tool-logs/${ctx.sessionKey}/${output.name}-${Date.now()}`;
    const result = typeof output.result === "string"
      ? output.result
      : JSON.stringify(output.result, null, 2);

    const content = buildNoteMarkdown({
      title: `Tool: ${output.name}`,
      type: "tool-log",
      tags: ["tool-log", output.name],
      body: `## Result\n\n\`\`\`\n${result.slice(0, 2000)}\n\`\`\`\n\n_Duration: ${output.durationMs}ms_`,
      related: [],
    });

    try {
      this.vault.write({
        path,
        title: `Tool: ${output.name}`,
        content,
        type: "tool-log",
        tags: ["tool-log", output.name],
        related: [],
      });
    } catch (err) {
      console.error("[VaultLogger] write error:", err);
    }
  }
}
