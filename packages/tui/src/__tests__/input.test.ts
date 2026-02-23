import { EventEmitter } from 'node:events';
import { signal } from '@vertz/ui';
import { describe, expect, it, vi } from 'vitest';
import { tui } from '../app';
import { useKeyboard } from '../input/hooks';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';
import { TestAdapter } from '../test/test-adapter';
import { TestStdin } from '../test/test-stdin';

/** Create a mock ReadStream for testing StdinReader integration. */
function createMockStdin() {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    setRawMode: () => emitter,
    resume: () => emitter,
    pause: () => emitter,
    isRaw: false,
    isTTY: true,
  }) as unknown as NodeJS.ReadStream;
}

function h(tag: string, props: Record<string, unknown>, ...children: unknown[]): TuiNode {
  return jsx(tag, { ...props, children: children.length === 1 ? children[0] : children });
}

describe('useKeyboard', () => {
  it('does nothing when no app is mounted', () => {
    useKeyboard(() => {});
    expect(true).toBe(true);
  });

  it('receives key events from TestStdin', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    const count = signal(0);

    const handler = (key: { name: string }) => {
      if (key.name === 'up') count.value++;
    };

    function App(): TuiNode {
      useKeyboard(handler);
      return h('Text', {}, `Count: ${count.value}`);
    }

    const handle = tui.mount(App, { adapter, testStdin });
    expect(adapter.textAt(0)).toContain('Count: 0');

    testStdin.pressKey('up');
    expect(adapter.textAt(0)).toContain('Count: 1');

    testStdin.pressKey('up');
    expect(adapter.textAt(0)).toContain('Count: 2');

    handle.unmount();
  });

  it('re-registers handler after unmount and remount', () => {
    const count = signal(0);

    const handler = (key: { name: string }) => {
      if (key.name === 'up') count.value++;
    };

    // Mount 1
    const adapter1 = new TestAdapter(40, 10);
    const testStdin1 = new TestStdin();
    function App1(): TuiNode {
      useKeyboard(handler);
      return h('Text', {}, `Count: ${count.value}`);
    }
    const handle1 = tui.mount(App1, { adapter: adapter1, testStdin: testStdin1 });
    testStdin1.pressKey('up');
    expect(count.value).toBe(1);
    handle1.unmount();

    // Mount 2 — same handler reference, new TestStdin
    const adapter2 = new TestAdapter(40, 10);
    const testStdin2 = new TestStdin();
    function App2(): TuiNode {
      useKeyboard(handler);
      return h('Text', {}, `Count: ${count.value}`);
    }
    const handle2 = tui.mount(App2, { adapter: adapter2, testStdin: testStdin2 });
    testStdin2.pressKey('up');
    expect(count.value).toBe(2);
    handle2.unmount();
  });

  it('receives key events from StdinReader when stdin option is provided', () => {
    const adapter = new TestAdapter(40, 10);
    const mockStdin = createMockStdin();
    const count = signal(0);

    const handler = (key: { name: string }) => {
      if (key.name === 'up') count.value++;
    };

    function App(): TuiNode {
      useKeyboard(handler);
      return h('Text', {}, `Count: ${count.value}`);
    }

    const handle = tui.mount(App, { adapter, stdin: mockStdin });

    // Emit raw key data for up arrow (ESC [ A)
    mockStdin.emit('data', Buffer.from('\x1b[A'));
    expect(count.value).toBe(1);

    handle.unmount();
  });

  it('stops receiving events from StdinReader after unmount', () => {
    const adapter = new TestAdapter(40, 10);
    const mockStdin = createMockStdin();
    const count = signal(0);

    const handler = (key: { name: string }) => {
      if (key.name === 'up') count.value++;
    };

    function App(): TuiNode {
      useKeyboard(handler);
      return h('Text', {}, `Count: ${count.value}`);
    }

    const handle = tui.mount(App, { adapter, stdin: mockStdin });
    mockStdin.emit('data', Buffer.from('\x1b[A'));
    expect(count.value).toBe(1);

    handle.unmount();

    // After unmount, events should not fire
    mockStdin.emit('data', Buffer.from('\x1b[A'));
    expect(count.value).toBe(1);
  });

  it('exits process on Ctrl+C when using StdinReader', () => {
    const adapter = new TestAdapter(40, 10);
    const mockStdin = createMockStdin();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const handler = () => {};

    function App(): TuiNode {
      useKeyboard(handler);
      return h('Text', {}, 'hello');
    }

    const handle = tui.mount(App, { adapter, stdin: mockStdin });

    // Emit Ctrl+C (byte 0x03)
    mockStdin.emit('data', Buffer.from([0x03]));
    expect(exitSpy).toHaveBeenCalledWith(130);

    exitSpy.mockRestore();
    handle.unmount();
  });
});
