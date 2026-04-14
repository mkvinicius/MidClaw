/**
 * MidClaw SubTurn — concurrent sub-agents with depth + concurrency limits
 * Pattern from OpenClaw subturn system
 *
 * Rules:
 *   - Max depth: 3 (prevents infinite recursion)
 *   - Max concurrency: 5 (per parent turn)
 *   - Each SubTurn gets an ephemeral session (no vault write by default)
 *   - Shared token budget across siblings
 *   - Parent can abort all children via AbortController
 */

import { EventBus } from "./eventbus.js";
import { randomUUID } from "crypto";

export const MAX_DEPTH = 3;
export const MAX_CONCURRENCY = 5;
export const DEFAULT_TOKEN_BUDGET = 50_000;

export interface SubTurnOptions {
  parentId: string;
  sessionKey: string;
  depth?: number;
  tokenBudget?: number;
  ephemeral?: boolean;       // true = don't write to vault
  label?: string;            // human-readable name for logs
  signal?: AbortSignal;
}

export interface SubTurnResult {
  id: string;
  label?: string;
  output: string;
  tokensUsed: number;
  depth: number;
  durationMs: number;
  aborted: boolean;
  error?: string;
}

export type SubTurnHandler = (
  id: string,
  depth: number,
  signal: AbortSignal,
  spawnChild: SubTurnSpawner
) => Promise<{ output: string; tokensUsed: number }>;

export type SubTurnSpawner = (
  handler: SubTurnHandler,
  opts?: Partial<SubTurnOptions>
) => Promise<SubTurnResult>;

interface ActiveSubTurn {
  id: string;
  controller: AbortController;
  promise: Promise<SubTurnResult>;
}

export class SubTurnManager {
  private bus?: EventBus;
  private active = new Map<string, ActiveSubTurn[]>(); // parentId → children

  constructor(bus?: EventBus) {
    this.bus = bus;
  }

  /**
   * Spawn a sub-agent. Returns a spawner function that enforces
   * depth and concurrency limits automatically.
   */
  spawner(opts: SubTurnOptions): SubTurnSpawner {
    const depth = opts.depth ?? 0;
    const tokenBudget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const parentId = opts.parentId;

    const spawnChild: SubTurnSpawner = async (handler, childOpts = {}) => {
      if (depth >= MAX_DEPTH) {
        return {
          id: randomUUID(),
          label: childOpts.label,
          output: "",
          tokensUsed: 0,
          depth,
          durationMs: 0,
          aborted: false,
          error: `max depth ${MAX_DEPTH} exceeded`,
        };
      }

      const siblings = this.active.get(parentId) ?? [];
      if (siblings.length >= MAX_CONCURRENCY) {
        return {
          id: randomUUID(),
          label: childOpts.label,
          output: "",
          tokensUsed: 0,
          depth,
          durationMs: 0,
          aborted: false,
          error: `max concurrency ${MAX_CONCURRENCY} exceeded`,
        };
      }

      const id = randomUUID();
      const controller = new AbortController();

      // Propagate parent abort to child
      if (opts.signal) {
        opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      const childSpawner: SubTurnSpawner = this.spawner({
        ...opts,
        ...childOpts,
        parentId: id,
        depth: depth + 1,
        tokenBudget: childOpts.tokenBudget ?? tokenBudget,
        signal: controller.signal,
      });

      this.bus?.emit("subturn.spawn", {
        id,
        parentId,
        depth: depth + 1,
        label: childOpts.label,
      }, { sessionKey: opts.sessionKey });

      const start = Date.now();

      const promise: Promise<SubTurnResult> = handler(id, depth + 1, controller.signal, childSpawner)
        .then(({ output, tokensUsed }) => ({
          id,
          label: childOpts.label,
          output,
          tokensUsed,
          depth: depth + 1,
          durationMs: Date.now() - start,
          aborted: false,
        }))
        .catch((err): SubTurnResult => {
          const aborted = controller.signal.aborted;
          return {
            id,
            label: childOpts.label,
            output: "",
            tokensUsed: 0,
            depth: depth + 1,
            durationMs: Date.now() - start,
            aborted,
            error: aborted ? "aborted" : String(err),
          };
        })
        .finally(() => {
          this.bus?.emit("subturn.end", { id, parentId }, { sessionKey: opts.sessionKey });
          const list = this.active.get(parentId);
          if (list) {
            const idx = list.findIndex(a => a.id === id);
            if (idx !== -1) list.splice(idx, 1);
          }
        });

      const active: ActiveSubTurn = { id, controller, promise };
      if (!this.active.has(parentId)) this.active.set(parentId, []);
      this.active.get(parentId)!.push(active);

      return promise;
    };

    return spawnChild;
  }

  /**
   * Run multiple sub-agents concurrently and collect results.
   * Enforces MAX_CONCURRENCY automatically.
   */
  async runAll(
    handlers: Array<{ handler: SubTurnHandler; opts?: Partial<SubTurnOptions> }>,
    parentOpts: SubTurnOptions
  ): Promise<SubTurnResult[]> {
    const spawner = this.spawner(parentOpts);
    const batches: Promise<SubTurnResult>[][] = [];

    for (let i = 0; i < handlers.length; i += MAX_CONCURRENCY) {
      const batch = handlers.slice(i, i + MAX_CONCURRENCY).map(({ handler, opts }) =>
        spawner(handler, opts)
      );
      batches.push(batch);
    }

    const results: SubTurnResult[] = [];
    for (const batch of batches) {
      const batchResults = await Promise.all(batch);
      results.push(...batchResults);
    }
    return results;
  }

  /**
   * Abort all active children of a given parent.
   */
  abortAll(parentId: string): void {
    const list = this.active.get(parentId) ?? [];
    for (const child of list) {
      child.controller.abort();
    }
  }

  activeCount(parentId: string): number {
    return this.active.get(parentId)?.length ?? 0;
  }
}
