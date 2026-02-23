import { signal } from '@vertz/ui';
import { describe, expect, it } from 'vitest';
import { tui } from '../app';
import { useKeyboard } from '../input/hooks';
import type { KeyEvent } from '../input/key-parser';
import { match } from '../input/match';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';
import { TestAdapter } from '../test/test-adapter';
import { TestStdin } from '../test/test-stdin';

function h(tag: string, props: Record<string, unknown>, ...children: unknown[]): TuiNode {
  return jsx(tag, { ...props, children: children.length === 1 ? children[0] : children });
}

describe('match', () => {
  it('dispatches simple key names', () => {
    const calls: string[] = [];
    const handler = match({
      up: () => calls.push('up'),
      down: () => calls.push('down'),
    });

    handler({ name: 'up', char: '', ctrl: false, shift: false, meta: false });
    handler({ name: 'down', char: '', ctrl: false, shift: false, meta: false });

    expect(calls).toEqual(['up', 'down']);
  });

  it('dispatches modifier combos', () => {
    const calls: string[] = [];
    const handler = match({
      'ctrl+c': () => calls.push('ctrl+c'),
      'shift+tab': () => calls.push('shift+tab'),
      'meta+s': () => calls.push('meta+s'),
    });

    handler({ name: 'c', char: '', ctrl: true, shift: false, meta: false });
    handler({ name: 'tab', char: '', ctrl: false, shift: true, meta: false });
    handler({ name: 's', char: 's', ctrl: false, shift: false, meta: true });

    expect(calls).toEqual(['ctrl+c', 'shift+tab', 'meta+s']);
  });

  it('requires exact modifier match — "up" does not match ctrl+up', () => {
    const calls: string[] = [];
    const handler = match({
      up: () => calls.push('up'),
    });

    handler({ name: 'up', char: '', ctrl: true, shift: false, meta: false });

    expect(calls).toEqual([]);
  });

  it('no-ops when no pattern matches', () => {
    const calls: string[] = [];
    const handler = match({
      up: () => calls.push('up'),
    });

    handler({ name: 'down', char: '', ctrl: false, shift: false, meta: false });

    expect(calls).toEqual([]);
  });

  it('first match wins when multiple patterns could match', () => {
    const calls: string[] = [];
    const handler = match({
      return: () => calls.push('first'),
    });

    handler({ name: 'return', char: '', ctrl: false, shift: false, meta: false });

    expect(calls).toEqual(['first']);
  });

  it('passes the KeyEvent to the handler', () => {
    let received: KeyEvent | null = null;
    const handler = match({
      a: (key) => {
        received = key;
      },
    });

    const event: KeyEvent = { name: 'a', char: 'a', ctrl: false, shift: false, meta: false };
    handler(event);

    expect(received).toBe(event);
  });

  it('supports multi-modifier combos like ctrl+shift+a', () => {
    const calls: string[] = [];
    const handler = match({
      'ctrl+shift+a': () => calls.push('ctrl+shift+a'),
    });

    // Should not match with only ctrl
    handler({ name: 'a', char: '', ctrl: true, shift: false, meta: false });
    expect(calls).toEqual([]);

    // Should match with both ctrl and shift
    handler({ name: 'a', char: '', ctrl: true, shift: true, meta: false });
    expect(calls).toEqual(['ctrl+shift+a']);
  });

  it('works with useKeyboard integration', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    const count = signal(0);

    const handler = match({
      up: () => {
        count.value++;
      },
      down: () => {
        count.value--;
      },
    });

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

    testStdin.pressKey('down');
    expect(adapter.textAt(0)).toContain('Count: 1');

    // Unmatched key — no change
    testStdin.pressKey('left');
    expect(adapter.textAt(0)).toContain('Count: 1');

    handle.unmount();
  });
});
