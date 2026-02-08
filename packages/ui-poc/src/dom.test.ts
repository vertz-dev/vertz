import { describe, expect, it, vi } from 'vitest';
import { attr, conditional, element, list, on, text } from './dom';
import { signal } from './signal';

// We need a DOM environment for these tests
// Using happy-dom via vitest environment
// For now, test with a minimal JSDOM-like setup via global

// We'll test using node's built-in DOM if available or skip gracefully
const hasDom = typeof document !== 'undefined';

describe('element()', () => {
  it.skipIf(!hasDom)('creates a DOM element with the given tag', () => {
    const div = element('div');
    expect(div.tagName).toBe('DIV');
  });

  it.skipIf(!hasDom)('creates different tag types', () => {
    const p = element('p');
    expect(p.tagName).toBe('P');
    const span = element('span');
    expect(span.tagName).toBe('SPAN');
  });
});

describe('text()', () => {
  it.skipIf(!hasDom)('creates a reactive text node', () => {
    const s = signal('hello');
    const node = text(() => s.get());
    expect(node.textContent).toBe('hello');
  });

  it.skipIf(!hasDom)('updates text when signal changes', () => {
    const s = signal('before');
    const node = text(() => s.get());
    expect(node.textContent).toBe('before');
    s.set('after');
    expect(node.textContent).toBe('after');
  });

  it.skipIf(!hasDom)('handles string interpolation', () => {
    const count = signal(0);
    const node = text(() => `Count: ${count.get()}`);
    expect(node.textContent).toBe('Count: 0');
    count.set(42);
    expect(node.textContent).toBe('Count: 42');
  });
});

describe('attr()', () => {
  it.skipIf(!hasDom)('sets a string attribute reactively', () => {
    const el = element('div');
    const cls = signal('active');
    attr(el, 'class', () => cls.get());
    expect(el.getAttribute('class')).toBe('active');
    cls.set('inactive');
    expect(el.getAttribute('class')).toBe('inactive');
  });

  it.skipIf(!hasDom)('removes attribute when value is false', () => {
    const el = element('button');
    const disabled = signal(true as boolean);
    attr(el, 'disabled', () => disabled.get());
    expect(el.hasAttribute('disabled')).toBe(true);
    disabled.set(false);
    expect(el.hasAttribute('disabled')).toBe(false);
  });

  it.skipIf(!hasDom)('removes attribute when value is null', () => {
    const el = element('div');
    const val = signal<string | null>('test');
    attr(el, 'data-x', () => val.get());
    expect(el.getAttribute('data-x')).toBe('test');
    val.set(null);
    expect(el.hasAttribute('data-x')).toBe(false);
  });
});

describe('on()', () => {
  it.skipIf(!hasDom)('attaches an event listener', () => {
    const el = element('button');
    const handler = vi.fn();
    on(el, 'click', handler);
    el.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.skipIf(!hasDom)('returns a cleanup function that removes the listener', () => {
    const el = element('button');
    const handler = vi.fn();
    const cleanup = on(el, 'click', handler);
    cleanup();
    el.click();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('conditional()', () => {
  it.skipIf(!hasDom)('renders true branch when condition is true', () => {
    const show = signal(true);
    const container = element('div');

    const node = conditional(
      () => show.get(),
      () => {
        const span = element('span');
        span.textContent = 'visible';
        return span;
      },
      () => {
        const span = element('span');
        span.textContent = 'hidden';
        return span;
      },
    );

    container.appendChild(node);
    // After effect runs, the anchor gets replaced
    expect(container.textContent).toBe('visible');
  });

  it.skipIf(!hasDom)('switches to false branch when condition changes', () => {
    const show = signal(true);
    const container = element('div');

    const node = conditional(
      () => show.get(),
      () => {
        const span = element('span');
        span.textContent = 'yes';
        return span;
      },
      () => {
        const span = element('span');
        span.textContent = 'no';
        return span;
      },
    );

    container.appendChild(node);
    expect(container.textContent).toBe('yes');

    show.set(false);
    expect(container.textContent).toBe('no');
  });

  it.skipIf(!hasDom)('creates branches lazily', () => {
    const show = signal(false);
    const trueFn = vi.fn(() => element('span'));
    const falseFn = vi.fn(() => element('span'));

    const container = element('div');
    container.appendChild(conditional(() => show.get(), trueFn, falseFn));

    expect(trueFn).not.toHaveBeenCalled();
    expect(falseFn).toHaveBeenCalledTimes(1);
  });
});

describe('list()', () => {
  it.skipIf(!hasDom)('renders items from a reactive array', () => {
    const items = signal([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    const container = element('ul');
    const frag = list(
      () => items.get(),
      (item) => item.id,
      (item) => {
        const li = element('li');
        li.textContent = item.name;
        return li;
      },
    );
    container.appendChild(frag);

    const lis = container.querySelectorAll('li');
    expect(lis.length).toBe(2);
    expect(lis[0]?.textContent).toBe('Alice');
    expect(lis[1]?.textContent).toBe('Bob');
  });

  it.skipIf(!hasDom)('adds new items', () => {
    const items = signal([{ id: 1, name: 'Alice' }]);

    const container = element('ul');
    container.appendChild(
      list(
        () => items.get(),
        (item) => item.id,
        (item) => {
          const li = element('li');
          li.textContent = item.name;
          return li;
        },
      ),
    );

    expect(container.querySelectorAll('li').length).toBe(1);

    items.set([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelectorAll('li')[1]?.textContent).toBe('Bob');
  });

  it.skipIf(!hasDom)('removes items', () => {
    const items = signal([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ]);

    const container = element('ul');
    container.appendChild(
      list(
        () => items.get(),
        (item) => item.id,
        (item) => {
          const li = element('li');
          li.textContent = item.name;
          return li;
        },
      ),
    );

    expect(container.querySelectorAll('li').length).toBe(3);

    items.set([
      { id: 1, name: 'Alice' },
      { id: 3, name: 'Charlie' },
    ]);

    expect(container.querySelectorAll('li').length).toBe(2);
    expect(container.querySelectorAll('li')[0]?.textContent).toBe('Alice');
    expect(container.querySelectorAll('li')[1]?.textContent).toBe('Charlie');
  });

  it.skipIf(!hasDom)('reuses existing DOM nodes for same keys', () => {
    const items = signal([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    const container = element('ul');
    container.appendChild(
      list(
        () => items.get(),
        (item) => item.id,
        (item) => {
          const li = element('li');
          li.textContent = item.name;
          return li;
        },
      ),
    );

    const firstLi = container.querySelectorAll('li')[0]!;

    // Reorder: Bob first, Alice second
    items.set([
      { id: 2, name: 'Bob' },
      { id: 1, name: 'Alice' },
    ]);

    // Alice's LI should be the same DOM node (reused, not recreated)
    const reorderedLis = container.querySelectorAll('li');
    expect(reorderedLis[1]).toBe(firstLi);
    expect(reorderedLis[0]?.textContent).toBe('Bob');
    expect(reorderedLis[1]?.textContent).toBe('Alice');
  });
});
