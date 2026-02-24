/**
 * Integration tests for the two-tier effect model (#666).
 *
 * These tests validate that domEffect() runs callbacks once in SSR (no tracking),
 * and that DOM primitives produce correct output during SSR without subscriptions.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { signal } from '../../runtime/signal';
import { __attr, __classList, __show } from '../attributes';
import { __conditional } from '../conditional';
import { __child, __text } from '../element';
import { __list } from '../list';

describe('two-tier effect model — SSR integration', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__ = () => true;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__VERTZ_IS_SSR__;
  });

  it('__text produces correct text content in SSR', () => {
    const count = signal(0);
    const node = __text(() => String(count.value));
    expect(node.textContent).toBe('0');
  });

  it('__text does not create signal subscriptions in SSR', () => {
    const count = signal(0);
    const node = __text(() => String(count.value));
    // If subscriptions were created, changing the signal would re-run the effect
    // and update the text. In SSR, the text should stay at initial value.
    count.value = 99;
    expect(node.textContent).toBe('0');
  });

  it('__child produces correct content in SSR', () => {
    const name = signal('world');
    const node = __child(() => `hello ${name.value}`);
    expect(node.textContent).toBe('hello world');
  });

  it('__child does not react to signal changes in SSR', () => {
    const name = signal('world');
    const node = __child(() => `hello ${name.value}`);
    name.value = 'universe';
    expect(node.textContent).toBe('hello world');
  });

  it('__conditional evaluates correct branch in SSR', () => {
    const isLoggedIn = signal(true);
    const result = __conditional(
      () => isLoggedIn.value,
      () => document.createTextNode('Welcome'),
      () => document.createTextNode('Login'),
    );
    // Fragment contains anchor comment + branch node
    const textNodes = Array.from(result.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    expect(textNodes[0]?.textContent).toBe('Welcome');
  });

  it('__conditional false branch in SSR', () => {
    const isLoggedIn = signal(false);
    const result = __conditional(
      () => isLoggedIn.value,
      () => document.createTextNode('Welcome'),
      () => document.createTextNode('Login'),
    );
    const textNodes = Array.from(result.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
    expect(textNodes[0]?.textContent).toBe('Login');
  });

  it('__conditional does not switch branches when signal changes in SSR', () => {
    const show = signal(true);
    const result = __conditional(
      () => show.value,
      () => document.createTextNode('Yes'),
      () => document.createTextNode('No'),
    );
    const textBefore = Array.from(result.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent);

    show.value = false;

    // After signal change, same branch should still be rendered (no reactivity in SSR)
    const textAfter = Array.from(result.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent);

    expect(textBefore).toEqual(textAfter);
  });

  it('__attr sets attribute value in SSR', () => {
    const el = document.createElement('button');
    const disabled = signal(true);
    __attr(el, 'disabled', () => (disabled.value ? '' : null));
    expect(el.getAttribute('disabled')).toBe('');
  });

  it('__attr does not react to changes in SSR', () => {
    const el = document.createElement('button');
    const disabled = signal(true);
    __attr(el, 'disabled', () => (disabled.value ? '' : null));
    disabled.value = false;
    // Should still be disabled — no reactivity in SSR
    expect(el.getAttribute('disabled')).toBe('');
  });

  it('__show sets display in SSR', () => {
    const el = document.createElement('div');
    const visible = signal(false);
    __show(el, () => visible.value);
    expect(el.style.display).toBe('none');
  });

  it('__classList sets classes in SSR', () => {
    const el = document.createElement('div');
    const active = signal(true);
    __classList(el, {
      active: () => active.value,
      disabled: () => !active.value,
    });
    expect(el.classList.contains('active')).toBe(true);
    expect(el.classList.contains('disabled')).toBe(false);
  });

  it('__list renders all items in SSR', () => {
    const items = signal(['a', 'b', 'c']);
    const container = document.createElement('ul');
    __list(
      container,
      () => items.value,
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

  it('__list does not react to signal changes in SSR', () => {
    const items = signal(['a', 'b']);
    const container = document.createElement('ul');
    __list(
      container,
      () => items.value,
      (item) => item,
      (item) => {
        const li = document.createElement('li');
        li.textContent = item;
        return li;
      },
    );
    items.value = ['x', 'y', 'z'];
    // Should still have 2 items — no reactivity in SSR
    expect(container.children.length).toBe(2);
  });

  it('cross-component signal reads work in SSR', () => {
    // Simulate a "shared signal" read by multiple components
    const theme = signal('dark');

    const header = __text(() => `theme: ${theme.value}`);
    const footer = __text(() => `current: ${theme.value}`);

    expect(header.textContent).toBe('theme: dark');
    expect(footer.textContent).toBe('current: dark');
  });

  it('depth-first rendering order in SSR', () => {
    const renderOrder: string[] = [];
    const s = signal('test');

    // Outer component renders first, then inner
    __text(() => {
      renderOrder.push('outer');
      return s.value;
    });
    __text(() => {
      renderOrder.push('inner');
      return s.value;
    });

    expect(renderOrder).toEqual(['outer', 'inner']);
  });

  it('no infinite loops when signal is read in SSR domEffect', () => {
    const count = signal(0);
    let iterations = 0;

    // In CSR, writing to a signal inside its own effect would cause re-runs.
    // In SSR, domEffect runs once without tracking, so this is safe.
    __text(() => {
      iterations++;
      const val = count.value;
      // This would be problematic in CSR but safe in SSR since no subscriptions
      return String(val);
    });

    expect(iterations).toBe(1);
  });
});
