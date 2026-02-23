import { signal } from '@vertz/ui';
import { describe, expect, it } from 'vitest';
import { tui } from '../app';
import { useKeyboard } from '../input/hooks';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';
import { TestAdapter } from '../test/test-adapter';
import { TestStdin } from '../test/test-stdin';

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
});
