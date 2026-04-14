/**
 * MidClaw Dreaming — background memory consolidation
 * Pattern from OpenClaw context-engine (dreaming/consolidation cycle)
 *
 * Runs periodically to:
 *   1. Find notes with many backlinks (hot nodes)
 *   2. Merge duplicate/similar notes
 *   3. Promote important tags to index notes
 *   4. Decay stale notes (mark as archived)
 */

import { VaultStore } from "./store.js";
import { buildNoteMarkdown } from "./wikilink.js";
import { EventBus } from "../core/eventbus.js";

export interface DreamingOptions {
  /** Interval in ms between consolidation runs (default: 5 minutes) */
  intervalMs?: number;
  /** Min backlink count to be considered "hot" (default: 3) */
  hotNodeThreshold?: number;
  /** Notes older than this (ms) with no activity get archived (default: 7 days) */
  staleThresholdMs?: number;
  /** Max notes to process per run (default: 100) */
  batchSize?: number;
}

export interface ConsolidationResult {
  hotNodes: string[];
  indexNotesCreated: number;
  archivedNotes: number;
  runDurationMs: number;
}

export class DreamingEngine {
  private vault: VaultStore;
  private bus?: EventBus;
  private opts: Required<DreamingOptions>;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(vault: VaultStore, opts: DreamingOptions = {}, bus?: EventBus) {
    this.vault = vault;
    this.bus = bus;
    this.opts = {
      intervalMs: opts.intervalMs ?? 5 * 60 * 1000,
      hotNodeThreshold: opts.hotNodeThreshold ?? 3,
      staleThresholdMs: opts.staleThresholdMs ?? 7 * 24 * 60 * 60 * 1000,
      batchSize: opts.batchSize ?? 100,
    };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.consolidate().catch(err =>
        console.error("[Dreaming] consolidation error:", err)
      );
    }, this.opts.intervalMs);

    // Run immediately on start
    this.consolidate().catch(err =>
      console.error("[Dreaming] initial consolidation error:", err)
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async consolidate(): Promise<ConsolidationResult> {
    if (this.running) return {
      hotNodes: [], indexNotesCreated: 0, archivedNotes: 0, runDurationMs: 0,
    };

    this.running = true;
    const start = Date.now();
    const result: ConsolidationResult = {
      hotNodes: [],
      indexNotesCreated: 0,
      archivedNotes: 0,
      runDurationMs: 0,
    };

    try {
      const notes = this.vault.list(undefined, this.opts.batchSize);

      // 1. Find hot nodes (many backlinks)
      for (const note of notes) {
        const backlinks = this.vault.getBacklinks(note.path);
        if (backlinks.length >= this.opts.hotNodeThreshold) {
          result.hotNodes.push(note.path);
        }
      }

      // 2. Create index notes for hot tag clusters
      const tagMap = new Map<string, string[]>();
      for (const note of notes) {
        for (const tag of note.tags) {
          if (!tagMap.has(tag)) tagMap.set(tag, []);
          tagMap.get(tag)!.push(note.path);
        }
      }

      for (const [tag, paths] of tagMap) {
        if (paths.length >= this.opts.hotNodeThreshold) {
          const indexPath = `index/${tag}`;
          const existing = this.vault.get(indexPath);

          // Only create if it doesn't exist or is outdated
          if (!existing || Date.now() - existing.updatedAt > this.opts.intervalMs) {
            const links = paths.map(p => `- [[${p}]]`).join("\n");
            const content = buildNoteMarkdown({
              title: `Index: ${tag}`,
              type: "index",
              tags: ["index", tag],
              body: `Auto-generated index for tag \`#${tag}\`\n\n## Notes\n\n${links}`,
              related: paths,
            });

            this.vault.write({
              path: indexPath,
              title: `Index: ${tag}`,
              content,
              type: "index",
              tags: ["index", tag],
              related: paths,
            });
            result.indexNotesCreated++;
          }
        }
      }

      // 3. Archive stale notes (type: incident, tool-log older than threshold)
      const staleTypes = ["tool-log"];
      const cutoff = Date.now() - this.opts.staleThresholdMs;

      for (const note of notes) {
        if (staleTypes.includes(note.type) && note.updatedAt < cutoff) {
          // Mark as archived by updating tags
          if (!note.tags.includes("archived")) {
            this.vault.write({
              ...note,
              tags: [...note.tags, "archived"],
              content: note.content,
            });
            result.archivedNotes++;
          }
        }
      }

      result.runDurationMs = Date.now() - start;

      this.bus?.emit("vault.write", {
        action: "consolidation",
        hotNodes: result.hotNodes.length,
        indexNotes: result.indexNotesCreated,
        archived: result.archivedNotes,
        durationMs: result.runDurationMs,
      });

    } finally {
      this.running = false;
    }

    return result;
  }
}
