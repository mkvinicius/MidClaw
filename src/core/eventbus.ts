/**
 * MidClaw EventBus — non-blocking multi-subscriber broadcaster
 * Pattern from PicoClaw pkg/agent/eventbus.go
 * Never blocks the main loop. Drops events silently when subscriber is full.
 */

export type EventKind =
  | "tool.before"
  | "tool.after"
  | "llm.before"
  | "llm.after"
  | "turn.start"
  | "turn.end"
  | "subturn.spawn"
  | "subturn.end"
  | "vault.write"
  | "alert.security"
  | "simulation.start"
  | "simulation.end"
  | "interrupt.received";

export interface AgentEvent {
  kind: EventKind;
  timestamp: number;
  sessionKey?: string;
  agentId?: string;
  payload: Record<string, unknown>;
}

export type EventHandler = (event: AgentEvent) => void | Promise<void>;

interface Subscriber {
  id: number;
  handler: EventHandler;
  buffer: AgentEvent[];
  maxBuffer: number;
  dropped: number;
}

export class EventBus {
  private subscribers = new Map<number, Subscriber>();
  private nextId = 0;
  private closed = false;

  subscribe(handler: EventHandler, maxBuffer = 64): number {
    if (this.closed) return -1;
    const id = ++this.nextId;
    this.subscribers.set(id, { id, handler, buffer: [], maxBuffer, dropped: 0 });
    return id;
  }

  unsubscribe(id: number): void {
    this.subscribers.delete(id);
  }

  emit(kind: EventKind, payload: Record<string, unknown>, meta?: Partial<AgentEvent>): void {
    if (this.closed) return;
    const event: AgentEvent = {
      kind,
      timestamp: Date.now(),
      payload,
      ...meta,
    };

    for (const sub of this.subscribers.values()) {
      if (sub.buffer.length >= sub.maxBuffer) {
        sub.dropped++;
        continue; // never block
      }
      sub.buffer.push(event);
      // Fire-and-forget — non-blocking
      setImmediate(() => {
        const evt = sub.buffer.shift();
        if (evt) {
          Promise.resolve(sub.handler(evt)).catch(err => {
            console.error(`[EventBus] subscriber ${sub.id} error:`, err);
          });
        }
      });
    }
  }

  dropped(subscriberId: number): number {
    return this.subscribers.get(subscriberId)?.dropped ?? 0;
  }

  close(): void {
    this.closed = true;
    this.subscribers.clear();
  }
}
