/**
 * SSR rendering tests for DOM compiler primitives.
 *
 * These tests verify that __insert, __text, __child, __conditional,
 * __attr, and __list work correctly during SSR (when __VERTZ_SSR__ is set).
 *
 * The test environment uses happy-dom (which provides a working DOM).
 * We set __VERTZ_SSR__ = true to activate the SSR code paths, which
 * evaluate content synchronously instead of using effect().
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { __attr } from '../attributes';
import { __conditional } from '../conditional';
import { __child, __insert, __text, isVNode, unwrapSignal, vnodeToDOM } from '../element';
import { __list } from '../list';

beforeEach(() => {
  (globalThis as Record<string, unknown>).__VERTZ_SSR__ = true;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__VERTZ_SSR__;
});

// ─── Fix 1: isSSR utility ─────────────────────────────────────────────────

describe('isSSR', () => {
  it('is importable from signal module', async () => {
    const { isSSR } = await import('../../runtime/signal');
    expect(typeof isSSR).toBe('function');
  });

  it('returns true when __VERTZ_SSR__ is set', async () => {
    const { isSSR } = await import('../../runtime/signal');
    expect(isSSR()).toBe(true);
  });
});

// ─── Fix 2: VNode/Signal helpers ──────────────────────────────────────────

describe('isVNode', () => {
  it('detects a VNode-like object', () => {
    expect(isVNode({ tag: 'div', attrs: {}, children: [] })).toBe(true);
  });

  it('detects VNode with only attrs', () => {
    expect(isVNode({ tag: 'div', attrs: {} })).toBe(true);
  });

  it('detects VNode with only children', () => {
    expect(isVNode({ tag: 'div', children: [] })).toBe(true);
  });

  it('rejects non-VNode objects', () => {
    expect(isVNode(null)).toBe(false);
    expect(isVNode('string')).toBe(false);
    expect(isVNode(42)).toBe(false);
    expect(isVNode({ foo: 'bar' })).toBe(false);
    expect(isVNode({ tag: 123 })).toBe(false);
  });

  it('rejects objects with tag but no attrs or children', () => {
    expect(isVNode({ tag: 'monster' })).toBe(false);
  });
});

describe('vnodeToDOM', () => {
  it('converts a VNode to a DOM element', () => {
    const node = vnodeToDOM({ tag: 'div', attrs: { class: 'loading' }, children: ['Loading...'] });
    expect(node).toBeInstanceOf(HTMLElement);
    expect((node as HTMLElement).tagName).toBe('DIV');
    expect((node as HTMLElement).getAttribute('class')).toBe('loading');
    expect((node as HTMLElement).textContent).toBe('Loading...');
  });

  it('converts a string to a text node', () => {
    const node = vnodeToDOM('hello');
    expect(node).toBeInstanceOf(Text);
    expect(node.textContent).toBe('hello');
  });

  it('handles falsy children (0 is rendered, false/null are skipped)', () => {
    const node = vnodeToDOM({
      tag: 'div',
      attrs: {},
      children: [0, false, null, 'text', true],
    });
    // 0 and 'text' should be rendered; false, null, true should be skipped
    const el = node as HTMLElement;
    expect(el.childNodes.length).toBe(2);
    expect(el.childNodes[0]?.textContent).toBe('0');
    expect(el.childNodes[1]?.textContent).toBe('text');
  });

  it('handles nested VNodes', () => {
    const node = vnodeToDOM({
      tag: 'ul',
      attrs: {},
      children: [
        { tag: 'li', attrs: {}, children: ['item 1'] },
        { tag: 'li', attrs: {}, children: ['item 2'] },
      ],
    });
    expect((node as HTMLElement).tagName).toBe('UL');
    expect((node as HTMLElement).children.length).toBe(2);
    expect((node as HTMLElement).children[0]?.textContent).toBe('item 1');
  });
});

describe('unwrapSignal', () => {
  it('unwraps a signal-like object using peek()', () => {
    const signalLike = { value: 'x', peek: () => 'x' };
    expect(unwrapSignal(signalLike)).toBe('x');
  });

  it('returns non-signal values unchanged', () => {
    expect(unwrapSignal('hello')).toBe('hello');
    expect(unwrapSignal(42)).toBe(42);
    expect(unwrapSignal(null)).toBe(null);
  });

  it('does not unwrap objects with peek but no value', () => {
    const notSignal = { peek: () => 'oops' };
    expect(unwrapSignal(notSignal)).toBe(notSignal);
  });
});

// ─── Fix 3: __insert SSR ──────────────────────────────────────────────────

describe('__insert (SSR)', () => {
  it('converts VNode-like objects to DOM nodes', () => {
    const parent = document.createElement('div');
    const vnode = { tag: 'div', attrs: { class: 'loading' }, children: ['Loading...'] };

    __insert(parent, vnode);

    expect(parent.children.length).toBe(1);
    expect(parent.children[0]?.tagName).toBe('DIV');
    expect(parent.children[0]?.getAttribute('class')).toBe('loading');
    expect(parent.children[0]?.textContent).toBe('Loading...');
  });

  it('unwraps signal-like values', () => {
    const parent = document.createElement('div');
    const signalLike = { value: 'hello', peek: () => 'hello' };

    __insert(parent, signalLike);

    expect(parent.textContent).toBe('hello');
  });

  it('still handles plain strings', () => {
    const parent = document.createElement('div');
    __insert(parent, 'text');
    expect(parent.textContent).toBe('text');
  });

  it('still handles DOM nodes', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    __insert(parent, child);
    expect(parent.firstChild).toBe(child);
  });

  it('still skips null/undefined/boolean', () => {
    const parent = document.createElement('div');
    __insert(parent, null);
    __insert(parent, undefined);
    __insert(parent, false);
    __insert(parent, true);
    expect(parent.childNodes.length).toBe(0);
  });
});

// ─── Fix 4: __text SSR ───────────────────────────────────────────────────

describe('__text (SSR)', () => {
  it('evaluates content synchronously during SSR', () => {
    const node = __text(() => 'hello');
    expect(node.data).toBe('hello');
  });

  it('handles null return by converting to empty string', () => {
    const node = __text(() => null);
    expect(node.data).toBe('');
  });

  it('unwraps signal-like values', () => {
    const signalLike = { value: 'from signal', peek: () => 'from signal' };
    // @ts-expect-error — testing duck-typed signal return from fn()
    const node = __text(() => signalLike);
    expect(node.data).toBe('from signal');
  });

  it('returns a disposable text node', () => {
    const node = __text(() => 'test');
    expect(typeof node.dispose).toBe('function');
    // dispose should be a no-op
    node.dispose();
  });
});

// ─── Fix 5: __child SSR ──────────────────────────────────────────────────

describe('__child (SSR)', () => {
  it('renders text content synchronously', () => {
    const wrapper = __child(() => 'hello');
    expect(wrapper.tagName).toBe('SPAN');
    expect(wrapper.textContent).toBe('hello');
  });

  it('renders VNode content', () => {
    const vnode = { tag: 'div', attrs: { class: 'test' }, children: ['content'] };
    const wrapper = __child(() => vnode);
    expect(wrapper.children.length).toBe(1);
    expect(wrapper.children[0]?.tagName).toBe('DIV');
    expect(wrapper.children[0]?.getAttribute('class')).toBe('test');
  });

  it('renders DOM node content', () => {
    const el = document.createElement('strong');
    el.textContent = 'bold';
    const wrapper = __child(() => el);
    expect(wrapper.firstChild).toBe(el);
  });

  it('handles null/boolean by rendering empty wrapper', () => {
    const wrapper = __child(() => null);
    expect(wrapper.childNodes.length).toBe(0);
  });

  it('unwraps signal-like values', () => {
    const signalLike = { value: 'unwrapped', peek: () => 'unwrapped' };
    // @ts-expect-error — testing duck-typed signal-like object
    const wrapper = __child(() => signalLike);
    expect(wrapper.textContent).toBe('unwrapped');
  });

  it('has display: contents style', () => {
    const wrapper = __child(() => 'test');
    expect(wrapper.style.display).toBe('contents');
  });

  it('returns a disposable element', () => {
    const wrapper = __child(() => 'test');
    expect(typeof wrapper.dispose).toBe('function');
    wrapper.dispose();
  });
});

// ─── Fix 6: __conditional SSR ─────────────────────────────────────────────

describe('__conditional (SSR)', () => {
  it('renders the true branch when condition is true', () => {
    const result = __conditional(
      () => true,
      () => {
        const el = document.createElement('div');
        el.textContent = 'visible';
        return el;
      },
      () => null,
    );
    // Result is a fragment; check its child
    expect(result.childNodes.length).toBe(1);
    const child = result.childNodes[0] as HTMLElement;
    expect(child.tagName).toBe('DIV');
    expect(child.textContent).toBe('visible');
  });

  it('renders the false branch when condition is false', () => {
    const result = __conditional(
      () => false,
      () => document.createElement('div'),
      () => {
        const el = document.createElement('span');
        el.textContent = 'fallback';
        return el;
      },
    );
    expect(result.childNodes.length).toBe(1);
    const child = result.childNodes[0] as HTMLElement;
    expect(child.tagName).toBe('SPAN');
    expect(child.textContent).toBe('fallback');
  });

  it('renders a comment for null branch result', () => {
    const result = __conditional(
      () => false,
      () => document.createElement('div'),
      () => null,
    );
    expect(result.childNodes.length).toBe(1);
    expect(result.childNodes[0]).toBeInstanceOf(Comment);
  });

  it('returns a disposable node', () => {
    const result = __conditional(
      () => true,
      () => document.createElement('div'),
      () => null,
    );
    expect(typeof result.dispose).toBe('function');
    result.dispose();
  });
});

// ─── Fix 7: __attr SSR ───────────────────────────────────────────────────

describe('__attr (SSR)', () => {
  it('sets boolean true attribute as empty string', () => {
    const el = document.createElement('button');
    __attr(el, 'disabled', () => true);
    expect(el.getAttribute('disabled')).toBe('');
  });

  it('removes attribute when value is false', () => {
    const el = document.createElement('button');
    el.setAttribute('disabled', '');
    __attr(el, 'disabled', () => false);
    expect(el.getAttribute('disabled')).toBeNull();
  });

  it('removes attribute when value is null', () => {
    const el = document.createElement('input');
    el.setAttribute('aria-invalid', 'true');
    __attr(el, 'aria-invalid', () => null);
    expect(el.getAttribute('aria-invalid')).toBeNull();
  });

  it('sets string attribute value', () => {
    const el = document.createElement('div');
    __attr(el, 'role', () => 'alert');
    expect(el.getAttribute('role')).toBe('alert');
  });

  it('handles numeric attribute values', () => {
    const el = document.createElement('input');
    // @ts-expect-error — testing numeric value coercion
    __attr(el, 'tabindex', () => 0);
    expect(el.getAttribute('tabindex')).toBe('0');
  });

  it('returns a no-op dispose function', () => {
    const el = document.createElement('div');
    const dispose = __attr(el, 'title', () => 'test');
    expect(typeof dispose).toBe('function');
    dispose();
  });
});

// ─── Fix 8: __list SSR ───────────────────────────────────────────────────

describe('__list (SSR)', () => {
  it('renders items synchronously', () => {
    const container = document.createElement('ul');
    __list(
      container,
      () => ['a', 'b', 'c'],
      (item) => item,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item;
        return li;
      },
    );
    expect(container.children.length).toBe(3);
    expect(container.children[0]?.textContent).toBe('a');
    expect(container.children[1]?.textContent).toBe('b');
    expect(container.children[2]?.textContent).toBe('c');
  });

  it('renders empty list when items is empty', () => {
    const container = document.createElement('ul');
    __list(
      container,
      () => [],
      (item: string) => item,
      (item: string) => {
        const li = document.createElement('li');
        li.textContent = item;
        return li;
      },
    );
    expect(container.children.length).toBe(0);
  });

  it('returns a no-op dispose function', () => {
    const container = document.createElement('ul');
    const dispose = __list(
      container,
      () => ['x'],
      (item) => item,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item;
        return li;
      },
    );
    expect(typeof dispose).toBe('function');
    dispose();
  });
});
