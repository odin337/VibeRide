import { describe, expect, it, vi } from 'vitest';

import { createGameEventBus, EventBus } from './event-bus';

interface TestEvents extends Record<string, unknown> {
  ping: { value: number };
  empty: Record<string, never>;
}

describe('EventBus', () => {
  it('delivers payloads to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);
    bus.emit('ping', { value: 42 });
    expect(handler).toHaveBeenCalledExactlyOnceWith({ value: 42 });
  });

  it('supports multiple subscribers per event', () => {
    const bus = new EventBus<TestEvents>();
    const first = vi.fn();
    const second = vi.fn();
    bus.on('ping', first);
    bus.on('ping', second);
    bus.emit('ping', { value: 1 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes via the returned function', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const unsubscribe = bus.on('ping', handler);
    unsubscribe();
    bus.emit('ping', { value: 1 });
    expect(handler).not.toHaveBeenCalled();
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('off() removes a specific handler only', () => {
    const bus = new EventBus<TestEvents>();
    const keep = vi.fn();
    const drop = vi.fn();
    bus.on('ping', keep);
    bus.on('ping', drop);
    bus.off('ping', drop);
    bus.emit('ping', { value: 5 });
    expect(keep).toHaveBeenCalledTimes(1);
    expect(drop).not.toHaveBeenCalled();
  });

  it('off() on an unknown event is a no-op', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => {
      bus.off('ping', vi.fn());
    }).not.toThrow();
  });

  it('once() fires exactly one time', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.once('ping', handler);
    bus.emit('ping', { value: 1 });
    bus.emit('ping', { value: 2 });
    expect(handler).toHaveBeenCalledExactlyOnceWith({ value: 1 });
  });

  it('isolates throwing handlers and reports them', () => {
    const onError = vi.fn();
    const bus = new EventBus<TestEvents>(onError);
    const healthy = vi.fn();
    bus.on('ping', () => {
      throw new Error('boom');
    });
    bus.on('ping', healthy);
    bus.emit('ping', { value: 1 });
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledExactlyOnceWith('ping', expect.any(Error));
  });

  it('emit on an event without subscribers is a no-op', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => {
      bus.emit('empty', {});
    }).not.toThrow();
  });

  it('clear() removes all subscriptions', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('ping', handler);
    bus.clear();
    bus.emit('ping', { value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('createGameEventBus produces a working typed bus', () => {
    const bus = createGameEventBus();
    const handler = vi.fn();
    bus.on('audio:beat', handler);
    bus.emit('audio:beat', { time: 0.5, indexInBar: 1 });
    expect(handler).toHaveBeenCalledExactlyOnceWith({ time: 0.5, indexInBar: 1 });
  });
});
