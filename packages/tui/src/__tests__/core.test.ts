import { describe, expect, it } from 'vitest';
import { tui } from '../app';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';
import { TestAdapter } from '../test/test-adapter';

// Helper to create elements without JSX syntax (since tests aren't compiled)
function h(tag: string, props: Record<string, unknown>, ...children: unknown[]): TuiNode {
  return jsx(tag, { ...props, children: children.length === 1 ? children[0] : children });
}

describe('JSX Runtime', () => {
  it('creates a TuiElement from intrinsic tag', () => {
    const node = jsx('Box', { direction: 'row', children: null });
    expect(node).toBeDefined();
    expect((node as Record<string, unknown>)._tuiElement).toBe(true);
  });

  it('creates a TuiTextNode from string children', () => {
    const node = jsx('Text', { children: 'Hello' });
    expect(node).toBeDefined();
  });

  it('calls component functions', () => {
    function MyComponent(props: { name: string }): TuiNode {
      return jsx('Text', { children: `Hello ${props.name}` });
    }
    const node = MyComponent({ name: 'World' });
    expect(node).toBeDefined();
  });
});

describe('tui.mount', () => {
  it('renders a Text component into the test adapter', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return h('Text', {}, 'Hello TUI');
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.textAt(0)).toContain('Hello TUI');
    handle.unmount();
  });

  it('renders a Box with column children', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return h('Box', { direction: 'column' }, h('Text', {}, 'Line 1'), h('Text', {}, 'Line 2'));
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.textAt(0)).toContain('Line 1');
    expect(adapter.textAt(1)).toContain('Line 2');
    handle.unmount();
  });

  it('renders a Box with row children', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return h('Box', { direction: 'row' }, h('Text', {}, 'AB'), h('Text', {}, 'CD'));
    }

    const handle = tui.mount(App, { adapter });
    const row = adapter.textAt(0);
    expect(row).toContain('AB');
    expect(row).toContain('CD');
    handle.unmount();
  });

  it('renders Spacer to push content apart', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return h(
        'Box',
        { direction: 'row', width: 40 },
        h('Text', {}, 'Left'),
        h('Spacer', {}),
        h('Text', {}, 'Right'),
      );
    }

    const handle = tui.mount(App, { adapter });
    const row = adapter.textAt(0);
    expect(row.indexOf('Left')).toBe(0);
    expect(row.indexOf('Right')).toBeGreaterThan(30);
    handle.unmount();
  });

  it('renders a Box with border', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return h('Box', { border: 'round' }, h('Text', {}, 'Hello'));
    }

    const handle = tui.mount(App, { adapter });
    const row0 = adapter.textAt(0);
    // Round border uses ╭ and ╮
    expect(row0).toContain('\u256D');
    expect(row0).toContain('\u256E');
    // Content on row 1
    expect(adapter.textAt(1)).toContain('Hello');
    handle.unmount();
  });

  it('renders Box with padding', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return h('Box', { padding: 1 }, h('Text', {}, 'Padded'));
    }

    const handle = tui.mount(App, { adapter });
    // With padding=1, text should be at row=1, col=1
    expect(adapter.textAt(0)).not.toContain('Padded');
    expect(adapter.textAt(1)).toContain('Padded');
    handle.unmount();
  });

  it('supports waitUntilExit', async () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return h('Text', {}, 'Test');
    }

    const handle = tui.mount(App, { adapter });

    // Unmount should resolve waitUntilExit
    setTimeout(() => handle.unmount(), 10);
    await handle.waitUntilExit();
    // If we get here, waitUntilExit resolved correctly
  });
});
