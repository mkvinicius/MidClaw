/**
 * MidClaw Steering — mid-execution message injection
 * Supports graceful and hard interrupts
 *
 * Based on OpenClaw interrupt handling + PicoClaw steering hooks
 *
 * Graceful: injects a user message at next LLM call boundary
 * Hard:     aborts the active AbortController immediately
 */

import { EventBus } from "./eventbus.js";

export type InterruptKind = "graceful" | "hard";

export interface SteeringMessage {
  id: string;
  kind: InterruptKind;
  content: string;
  timestamp: number;
}

export interface SteeringHandle {
  sessionKey: string;
  controller: AbortController;
}

export class SteeringHub {
  private sessions = new Map<string, SteeringHandle>();
  private queues = new Map<string, SteeringMessage[]>(); // graceful queue
  private bus?: EventBus;
  private msgCounter = 0;

  constructor(bus?: EventBus) {
    this.bus = bus;
  }

  /**
   * Register a session so it can be steered.
   * Returns the AbortController for that session.
   */
  register(sessionKey: string): AbortController {
    const controller = new AbortController();
    this.sessions.set(sessionKey, { sessionKey, controller });
    this.queues.set(sessionKey, []);
    return controller;
  }

  unregister(sessionKey: string): void {
    this.sessions.delete(sessionKey);
    this.queues.delete(sessionKey);
  }

  /**
   * Inject a graceful message. Will be picked up at the next
   * checkpoint (before the next LLM call).
   */
  inject(sessionKey: string, content: string): string {
    const id = `steer-${++this.msgCounter}`;
    const msg: SteeringMessage = {
      id,
      kind: "graceful",
      content,
      timestamp: Date.now(),
    };
    this.queues.get(sessionKey)?.push(msg);
    this.bus?.emit("interrupt.received", { sessionKey, kind: "graceful", id }, { sessionKey });
    return id;
  }

  /**
   * Hard abort — kills the current turn immediately via AbortController.
   */
  abort(sessionKey: string, reason = "user hard abort"): void {
    const handle = this.sessions.get(sessionKey);
    if (!handle) return;

    this.bus?.emit("interrupt.received", { sessionKey, kind: "hard", reason }, { sessionKey });
    handle.controller.abort(reason);

    // Re-register with a fresh controller for the next turn
    const fresh = new AbortController();
    this.sessions.set(sessionKey, { sessionKey, controller: fresh });
  }

  /**
   * Called by the agent loop before each LLM call.
   * Returns any pending steering messages and clears the queue.
   */
  drainQueue(sessionKey: string): SteeringMessage[] {
    const queue = this.queues.get(sessionKey) ?? [];
    this.queues.set(sessionKey, []);
    return queue;
  }

  /**
   * Peek without consuming — useful for deciding whether to checkpoint.
   */
  hasPending(sessionKey: string): boolean {
    return (this.queues.get(sessionKey)?.length ?? 0) > 0;
  }

  getSignal(sessionKey: string): AbortSignal | undefined {
    return this.sessions.get(sessionKey)?.controller.signal;
  }

  activeSessionCount(): number {
    return this.sessions.size;
  }
}
