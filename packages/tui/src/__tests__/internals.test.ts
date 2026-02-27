import { signal } from '@vertz/ui';
import { onCleanup, popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import { describe, expect, it } from 'vitest';
import {
  __append,
  __attr,
  __child,
  __conditional,
  __element,
  __enterChildren,
  __exitChildren,
  __insert,
  __list,
  __on,
  __staticText,
} from '../internals';
import { isTuiConditionalNode, isTuiElement, isTuiListNode, isTuiTextNode } from '../tui-element';

describe('__element', () => {
  it('creates a TuiElement with tag', () => {
    const el = __element('Box');
    expect(isTuiElement(el)).toBe(true);
    expect(el.tag).toBe('Box');
    expect(el.children).toEqual([]);
    expect(el.parent).toBeNull();
    expect(el.dirty).toBe(false);
  });

  it('creates a TuiElement with static props', () => {
    const el = __element('Box', 'direction', 'column');
    expect(el.props.direction).toBe('column');
    expect(el.layoutProps.direction).toBe('column');
  });

  it('creates a TuiElement with multiple static props', () => {
    const el = __element('Text', 'bold', true, 'color', 'cyan');
    expect(el.props.bold).toBe(true);
    expect(el.props.color).toBe('cyan');
    expect(el.style.bold).toBe(true);
    expect(el.style.color).toBe('cyan');
  });
});

describe('__staticText', () => {
  it('creates a TuiTextNode with static text', () => {
    const node = __staticText('Hello');
    expect(isTuiTextNode(node)).toBe(true);
    expect(node.text).toBe('Hello');
  });
});

describe('__append', () => {
  it('adds a child to parent', () => {
    const parent = __element('Box');
    const child = __element('Text');
    __append(parent, child);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]).toBe(child);
  });

  it('sets parent reference on child element', () => {
    const parent = __element('Box');
    const child = __element('Text');
    __append(parent, child);
    expect(child.parent).toBe(parent);
  });

  it('appends text nodes', () => {
    const parent = __element('Text');
    const text = __staticText('Hello');
    __append(parent, text);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]).toBe(text);
  });
});

describe('__child', () => {
  it('creates a reactive text node', () => {
    const count = signal(0);
    const scope = pushScope();
    const node = __child(() => `Count: ${count.value}`);
    popScope();
    expect(isTuiTextNode(node)).toBe(true);
    expect(node.text).toBe('Count: 0');
    runCleanups(scope);
  });

  it('updates text when signal changes', () => {
    const count = signal(0);
    const scope = pushScope();
    const node = __child(() => count.value);
    popScope();
    expect(node.text).toBe('0');
    count.value = 42;
    expect(node.text).toBe('42');
    runCleanups(scope);
  });

  it('handles null/undefined/boolean values', () => {
    const show = signal<string | null>(null);
    const scope = pushScope();
    const node = __child(() => show.value);
    popScope();
    expect(node.text).toBe('');
    show.value = 'visible';
    expect(node.text).toBe('visible');
    runCleanups(scope);
  });

  it('stops updating after disposal', () => {
    const count = signal(0);
    const scope = pushScope();
    const node = __child(() => `Count: ${count.value}`);
    popScope();
    expect(node.text).toBe('Count: 0');
    runCleanups(scope);
    count.value = 99;
    expect(node.text).toBe('Count: 0');
  });
});

describe('__attr', () => {
  it('sets a reactive attribute', () => {
    const bold = signal(true);
    const el = __element('Text');
    const scope = pushScope();
    __attr(el, 'bold', () => bold.value);
    popScope();
    expect(el.props.bold).toBe(true);
    expect(el.style.bold).toBe(true);
    bold.value = false;
    expect(el.props.bold).toBe(false);
    runCleanups(scope);
  });

  it('updates layout props reactively', () => {
    const dir = signal<'row' | 'column'>('row');
    const el = __element('Box');
    const scope = pushScope();
    __attr(el, 'direction', () => dir.value);
    popScope();
    expect(el.layoutProps.direction).toBe('row');
    dir.value = 'column';
    expect(el.layoutProps.direction).toBe('column');
    runCleanups(scope);
  });

  it('stops updating after disposal', () => {
    const color = signal('red');
    const el = __element('Text');
    const scope = pushScope();
    __attr(el, 'color', () => color.value);
    popScope();
    expect(el.props.color).toBe('red');
    runCleanups(scope);
    color.value = 'blue';
    expect(el.props.color).toBe('red');
  });
});

describe('__on', () => {
  it('is a no-op (TUI has no element events)', () => {
    const el = __element('Text');
    const handler = () => {};
    // Should not throw
    __on(el, 'click', handler);
  });
});

describe('__insert', () => {
  it('inserts a static child element', () => {
    const parent = __element('Box');
    const child = __element('Text');
    __insert(parent, child);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]).toBe(child);
  });

  it('inserts a static text string', () => {
    const parent = __element('Text');
    __insert(parent, 'hello');
    expect(parent.children).toHaveLength(1);
    const textNode = parent.children[0];
    expect(isTuiTextNode(textNode)).toBe(true);
    if (isTuiTextNode(textNode)) {
      expect(textNode.text).toBe('hello');
    }
  });

  it('skips null/undefined/boolean', () => {
    const parent = __element('Box');
    __insert(parent, null);
    __insert(parent, undefined);
    __insert(parent, false);
    expect(parent.children).toHaveLength(0);
  });
});

describe('__enterChildren / __exitChildren', () => {
  it('manages parent insertion context', () => {
    const parent = __element('Box');
    const child = __element('Text');
    __enterChildren(parent);
    // After entering, appends should target this parent
    __append(parent, child);
    __exitChildren();
    expect(parent.children).toHaveLength(1);
  });
});

describe('__conditional', () => {
  it('renders true branch when condition is true', () => {
    const show = signal(true);
    const parent = __element('Box');
    const scope = pushScope();
    const node = __conditional(
      () => show.value,
      () => __staticText('visible'),
      () => __staticText('hidden'),
    );
    popScope();
    __append(parent, node);
    expect(isTuiConditionalNode(node)).toBe(true);
    expect(node.current).not.toBeNull();
    if (isTuiTextNode(node.current)) {
      expect(node.current.text).toBe('visible');
    }
    runCleanups(scope);
  });

  it('renders false branch when condition is false', () => {
    const show = signal(false);
    const parent = __element('Box');
    const scope = pushScope();
    const node = __conditional(
      () => show.value,
      () => __staticText('visible'),
      () => __staticText('hidden'),
    );
    popScope();
    __append(parent, node);
    expect(node.current).not.toBeNull();
    if (isTuiTextNode(node.current)) {
      expect(node.current.text).toBe('hidden');
    }
    runCleanups(scope);
  });

  it('switches branches when condition changes', () => {
    const show = signal(true);
    const scope = pushScope();
    const node = __conditional(
      () => show.value,
      () => __staticText('visible'),
      () => __staticText('hidden'),
    );
    popScope();
    expect(isTuiTextNode(node.current)).toBe(true);
    if (isTuiTextNode(node.current)) {
      expect(node.current.text).toBe('visible');
    }
    show.value = false;
    if (isTuiTextNode(node.current)) {
      expect(node.current.text).toBe('hidden');
    }
    runCleanups(scope);
  });

  it('cleans up previous branch on switch', () => {
    const show = signal(true);
    let cleanedUp = false;
    const scope = pushScope();
    __conditional(
      () => show.value,
      () => {
        onCleanup(() => {
          cleanedUp = true;
        });
        return __staticText('visible');
      },
      () => __staticText('hidden'),
    );
    popScope();
    expect(cleanedUp).toBe(false);
    show.value = false;
    expect(cleanedUp).toBe(true);
    runCleanups(scope);
  });

  it('renders null when no false branch and condition is false', () => {
    const show = signal(false);
    const scope = pushScope();
    const node = __conditional(
      () => show.value,
      () => __staticText('visible'),
    );
    popScope();
    expect(node.current).toBeNull();
    runCleanups(scope);
  });
});

describe('__list', () => {
  it('renders items', () => {
    const items = signal([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);
    const parent = __element('Box');
    const scope = pushScope();
    const node = __list(
      parent,
      () => items.value,
      (item) => item.id,
      (item) => {
        const el = __element('Text');
        __append(el, __staticText(item.name));
        return el;
      },
    );
    popScope();
    expect(isTuiListNode(node)).toBe(true);
    expect(node.items).toHaveLength(2);
    runCleanups(scope);
  });

  it('adds new items', () => {
    const items = signal([{ id: 1, name: 'A' }]);
    const parent = __element('Box');
    const scope = pushScope();
    const node = __list(
      parent,
      () => items.value,
      (item) => item.id,
      (item) => {
        const el = __element('Text');
        __append(el, __staticText(item.name));
        return el;
      },
    );
    popScope();
    expect(node.items).toHaveLength(1);
    items.value = [
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ];
    expect(node.items).toHaveLength(2);
    runCleanups(scope);
  });

  it('removes stale items with cleanup', () => {
    const items = signal([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);
    const cleanups: number[] = [];
    const parent = __element('Box');
    const scope = pushScope();
    __list(
      parent,
      () => items.value,
      (item) => item.id,
      (item) => {
        onCleanup(() => cleanups.push(item.id));
        const el = __element('Text');
        __append(el, __staticText(item.name));
        return el;
      },
    );
    popScope();
    items.value = [{ id: 2, name: 'B' }];
    expect(cleanups).toEqual([1]);
    runCleanups(scope);
  });

  it('cleans up all items on disposal', () => {
    const items = signal([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);
    const cleanups: number[] = [];
    const parent = __element('Box');
    const scope = pushScope();
    __list(
      parent,
      () => items.value,
      (item) => item.id,
      (item) => {
        onCleanup(() => cleanups.push(item.id));
        const el = __element('Text');
        __append(el, __staticText(item.name));
        return el;
      },
    );
    popScope();
    runCleanups(scope);
    expect(cleanups).toContain(1);
    expect(cleanups).toContain(2);
  });
});
