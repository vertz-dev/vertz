import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../event-bus';

describe('createEventBus', () => {
  it('emits create events to subscribers', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on(handler);
    bus.emit({ type: 'create', table: 'users', data: { id: '1', name: 'Alice' } });

    expect(handler).toHaveBeenCalledWith({
      type: 'create',
      table: 'users',
      data: { id: '1', name: 'Alice' },
    });
  });

  it('emits update events to subscribers', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on(handler);
    bus.emit({ type: 'update', table: 'users', data: { id: '1', name: 'Bob' } });

    expect(handler).toHaveBeenCalledWith({
      type: 'update',
      table: 'users',
      data: { id: '1', name: 'Bob' },
    });
  });

  it('emits delete events to subscribers', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on(handler);
    bus.emit({ type: 'delete', table: 'users', data: { id: '1' } });

    expect(handler).toHaveBeenCalledWith({
      type: 'delete',
      table: 'users',
      data: { id: '1' },
    });
  });

  it('supports multiple subscribers', () => {
    const bus = createEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on(handler1);
    bus.on(handler2);
    bus.emit({ type: 'create', table: 'posts', data: { id: '1' } });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes handlers with off()', () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on(handler);
    bus.off(handler);
    bus.emit({ type: 'create', table: 'users', data: {} });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not call removed handler but still calls remaining handlers', () => {
    const bus = createEventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    bus.on(handler1);
    bus.on(handler2);
    bus.off(handler1);
    bus.emit({ type: 'update', table: 'posts', data: { id: '2' } });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });
});
