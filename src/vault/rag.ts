/**
 * MidClaw WikiRAG
 * Retrieval-Augmented Generation using [[wikilinks]] graph traversal
 * No vectors. No cloud. Fully offline.
 */

import { VaultStore, type VaultNote } from "./store.js";

export interface RagContext {
  notes: VaultNote[];
  tokens_estimate: number;
  context_block: string;
}

export class WikiRAG {
  constructor(private vault: VaultStore) {}

  /**
   * Build context for a query using FTS5 search + wikilink graph traversal.
   * This is the core innovation: deterministic, offline, human-readable retrieval.
   */
  async buildContext(query: string, opts?: {
    maxNotes?: number;
    traversalDepth?: number;
    maxTokens?: number;
  }): Promise<RagContext> {
    const maxNotes = opts?.maxNotes ?? 8;
    const depth = opts?.traversalDepth ?? 2;
    const maxTokens = opts?.maxTokens ?? 4000;

    // Step 1: FTS5 search
    const searchResults = this.vault.search(query, maxNotes);
    const seedNotes = searchResults.map(r => r.note);

    // Step 2: Traverse backlinks from each seed note
    const visited = new Set<string>(seedNotes.map(n => n.path));
    const allNotes: VaultNote[] = [...seedNotes];

    if (depth > 0) {
      for (const note of seedNotes) {
        this.traverse(note.path, depth, visited, allNotes);
      }
    }

    // Step 3: Deduplicate and trim to token budget
    const unique = allNotes.slice(0, maxNotes * 2);
    const trimmed = this.trimToTokenBudget(unique, maxTokens);

    return {
      notes: trimmed,
      tokens_estimate: this.estimateTokens(trimmed),
      context_block: this.formatContextBlock(trimmed, query),
    };
  }

  private traverse(
    notePath: string,
    depth: number,
    visited: Set<string>,
    acc: VaultNote[]
  ): void {
    if (depth === 0) return;

    const backlinks = this.vault.getBacklinks(notePath);
    for (const note of backlinks) {
      if (!visited.has(note.path)) {
        visited.add(note.path);
        acc.push(note);
        this.traverse(note.path, depth - 1, visited, acc);
      }
    }

    const forwardLinks = this.vault.getForwardLinks(notePath);
    for (const linkPath of forwardLinks) {
      if (!visited.has(linkPath)) {
        const note = this.vault.get(linkPath);
        if (note) {
          visited.add(linkPath);
          acc.push(note);
          this.traverse(linkPath, depth - 1, visited, acc);
        }
      }
    }
  }

  private trimToTokenBudget(notes: VaultNote[], maxTokens: number): VaultNote[] {
    let total = 0;
    const result: VaultNote[] = [];
    for (const note of notes) {
      const est = Math.ceil(note.content.length / 4);
      if (total + est > maxTokens) break;
      total += est;
      result.push(note);
    }
    return result;
  }

  private estimateTokens(notes: VaultNote[]): number {
    return notes.reduce((sum, n) => sum + Math.ceil(n.content.length / 4), 0);
  }

  private formatContextBlock(notes: VaultNote[], query: string): string {
    if (notes.length === 0) return "";

    const parts = [
      `<vault_context query="${query}" notes="${notes.length}">`,
      ...notes.map(n => [
        `<note path="${n.path}" type="${n.type}">`,
        `## ${n.title}`,
        n.content.slice(0, 1500),
        n.related.length ? `Links: ${n.related.map(r => `[[${r}]]`).join(", ")}` : "",
        `</note>`,
      ].filter(Boolean).join("\n")),
      `</vault_context>`,
    ];

    return parts.join("\n\n");
  }
}
