import { onCleanup, onMount, signal } from '@vertz/ui';
import { domEffect } from '@vertz/ui/internals';
import { describe, expect, it } from 'vitest';
import { tui } from '../app';
import { useKeyboard } from '../input/hooks';
import { __append, __attr, __child, __element, __staticText } from '../internals';
import { TestAdapter } from '../test/test-adapter';
import { TestStdin } from '../test/test-stdin';

describe('persistent tree mount', () => {
  it('renders a persistent tree built with internals', () => {
    const adapter = new TestAdapter(40, 10);

    function App() {
      const el = __element('Text');
      __append(el, __staticText('Hello Persistent'));
      return el;
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('Hello Persistent');
    handle.unmount();
  });

  it('updates reactively via __child', () => {
    const adapter = new TestAdapter(40, 10);
    const count = signal(0);

    function App() {
      const el = __element('Text');
      __append(
        el,
        __child(() => `Count: ${count.value}`),
      );
      return el;
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('Count: 0');
    count.value = 1;
    expect(adapter.text()).toContain('Count: 1');
    handle.unmount();
  });

  it('updates reactively via __attr', () => {
    const adapter = new TestAdapter(40, 10);
    const dir = signal<'row' | 'column'>('column');

    function App() {
      const box = __element('Box');
      __attr(box, 'direction', () => dir.value);
      const t1 = __element('Text');
      __append(t1, __staticText('A'));
      const t2 = __element('Text');
      __append(t2, __staticText('B'));
      __append(box, t1);
      __append(box, t2);
      return box;
    }

    const handle = tui.mount(App, { adapter });
    // Column: A and B on separate rows
    expect(adapter.textAt(0)).toContain('A');
    expect(adapter.textAt(1)).toContain('B');
    handle.unmount();
  });

  it('component runs once (not re-executed on signal change)', () => {
    const adapter = new TestAdapter(40, 10);
    const count = signal(0);
    let callCount = 0;

    function App() {
      callCount++;
      const el = __element('Text');
      __append(
        el,
        __child(() => `Count: ${count.value}`),
      );
      return el;
    }

    const handle = tui.mount(App, { adapter });
    expect(callCount).toBe(1);
    count.value = 1;
    expect(callCount).toBe(1); // Component not re-called
    expect(adapter.text()).toContain('Count: 1'); // But display updated
    handle.unmount();
  });

  it('unmount disposes all effects', () => {
    const adapter = new TestAdapter(40, 10);
    const count = signal(0);
    let effectRan = 0;

    function App() {
      const el = __element('Text');
      domEffect(() => {
        count.value;
        effectRan++;
      });
      __append(el, __staticText('Test'));
      return el;
    }

    const handle = tui.mount(App, { adapter });
    effectRan = 0;
    handle.unmount();
    count.value = 99;
    expect(effectRan).toBe(0); // Effect was disposed
  });

  it('keyboard input works with persistent tree', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    const count = signal(0);

    function App() {
      useKeyboard((key) => {
        if (key.name === 'up') count.value++;
      });
      const el = __element('Text');
      __append(
        el,
        __child(() => `Count: ${count.value}`),
      );
      return el;
    }

    const handle = tui.mount(App, { adapter, testStdin });
    expect(adapter.text()).toContain('Count: 0');
    testStdin.pressKey('up');
    expect(adapter.text()).toContain('Count: 1');
    testStdin.pressKey('up');
    expect(adapter.text()).toContain('Count: 2');
    handle.unmount();
  });

  it('cleanup works with onMount and onCleanup', () => {
    const adapter = new TestAdapter(40, 10);
    let cleaned = false;

    function App() {
      onMount(() => {
        onCleanup(() => {
          cleaned = true;
        });
      });
      const el = __element('Text');
      __append(el, __staticText('Hello'));
      return el;
    }

    const handle = tui.mount(App, { adapter });
    expect(cleaned).toBe(false);
    handle.unmount();
    expect(cleaned).toBe(true);
  });
});
