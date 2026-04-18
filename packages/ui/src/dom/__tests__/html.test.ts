import { afterEach, describe, expect, it } from '@vertz/test';
import { claimElement, endHydration, startHydration } from '../../hydrate/hydration-context';
import { signal } from '../../runtime/signal';
import { __html } from '../html';

describe('__html', () => {
  afterEach(() => {
    try {
      endHydration();
    } catch {
      // May throw if not hydrating
    }
  });

  it('sets element.innerHTML to the string returned by fn', () => {
    const el = document.createElement('pre');
    __html(el, () => '<b>hi</b>');
    expect(el.innerHTML).toBe('<b>hi</b>');
    expect(el.firstElementChild?.tagName).toBe('B');
  });

  it('sets innerHTML to empty string when fn returns null', () => {
    const el = document.createElement('div');
    __html(el, () => null);
    expect(el.innerHTML).toBe('');
  });

  it('sets innerHTML to empty string when fn returns undefined', () => {
    const el = document.createElement('div');
    __html(el, () => undefined);
    expect(el.innerHTML).toBe('');
  });

  it('updates innerHTML reactively when a signal changes', () => {
    const el = document.createElement('div');
    const html = signal('<i>one</i>');
    __html(el, () => html.value);
    expect(el.innerHTML).toBe('<i>one</i>');
    html.value = '<i>two</i>';
    expect(el.innerHTML).toBe('<i>two</i>');
  });

  it('stops updating innerHTML after the returned dispose is called', () => {
    const el = document.createElement('div');
    const html = signal('<span>a</span>');
    const dispose = __html(el, () => html.value);
    expect(el.innerHTML).toBe('<span>a</span>');
    dispose();
    html.value = '<span>b</span>';
    expect(el.innerHTML).toBe('<span>a</span>');
  });

  it('does not set an innerHTML HTML attribute', () => {
    const el = document.createElement('div');
    __html(el, () => '<b>x</b>');
    expect(el.getAttribute('innerHTML')).toBe(null);
  });

  it('marks hydrated SSR descendants as claimed so endHydration does not warn', () => {
    const root = document.createElement('div');
    const pre = document.createElement('pre');
    pre.innerHTML = '<b>x</b>';
    root.appendChild(pre);

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((a) => String(a)).join(' '));
    };

    try {
      startHydration(root);
      const claimedPre = claimElement('pre');
      expect(claimedPre).toBe(pre);
      __html(pre, () => '<b>x</b>');
      endHydration();
      expect(warnings.join('\n')).toBe('');
    } finally {
      console.warn = originalWarn;
    }
  });
});
