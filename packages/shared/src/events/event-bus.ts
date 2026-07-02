import type { GameEventMap } from './game-events';

export type EventHandler<TPayload> = (payload: TPayload) => void;

export type Unsubscribe = () => void;

/**
 * Minimal synchronous typed pub/sub. A handler that throws never breaks
 * other subscribers or the emitter — errors are routed to onHandlerError.
 */
export class EventBus<TEvents extends Record<string, unknown>> {
  private readonly handlers = new Map<keyof TEvents, Set<EventHandler<never>>>();

  constructor(private readonly onHandlerError?: (event: keyof TEvents, error: unknown) => void) {}

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): Unsubscribe {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      this.off(event, handler);
    };
  }

  once<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): Unsubscribe {
    const wrapped: EventHandler<TEvents[K]> = (payload) => {
      this.off(event, wrapped);
      handler(payload);
    };
    return this.on(event, wrapped);
  }

  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }
    set.delete(handler);
    if (set.size === 0) {
      this.handlers.delete(event);
    }
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }
    for (const handler of [...set]) {
      try {
        (handler as EventHandler<TEvents[K]>)(payload);
      } catch (error) {
        this.onHandlerError?.(event, error);
      }
    }
  }

  listenerCount(event: keyof TEvents): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}

export type GameEventBus = EventBus<GameEventMap>;

export function createGameEventBus(
  onHandlerError?: (event: keyof GameEventMap, error: unknown) => void,
): GameEventBus {
  return new EventBus<GameEventMap>(onHandlerError);
}
