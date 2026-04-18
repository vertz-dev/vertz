import { describe, expect, it } from '@vertz/test';
import { jsx } from '../index';

describe('jsx innerHTML prop (test/dev runtime)', () => {
  it('sets element.innerHTML when innerHTML is provided as a string', () => {
    const el = jsx('pre', { innerHTML: '<span>a</span>' }) as HTMLElement;
    expect(el.innerHTML).toBe('<span>a</span>');
    expect(el.firstElementChild?.tagName).toBe('SPAN');
  });

  it('sets innerHTML to empty when innerHTML is undefined', () => {
    const el = jsx('pre', { innerHTML: undefined }) as HTMLElement;
    expect(el.innerHTML).toBe('');
  });

  it('sets innerHTML to empty when innerHTML is null', () => {
    const el = jsx('pre', { innerHTML: null }) as HTMLElement;
    expect(el.innerHTML).toBe('');
  });

  it('does not emit innerHTML as an HTML attribute', () => {
    const el = jsx('pre', { innerHTML: '<b>x</b>' }) as HTMLElement;
    expect(el.getAttribute('innerHTML')).toBe(null);
  });

  it('applies class and event listeners alongside innerHTML', () => {
    let clicked = false;
    const el = jsx('div', {
      className: 'code',
      innerHTML: '<b>x</b>',
      onClick: () => {
        clicked = true;
      },
    }) as HTMLElement;
    expect(el.className).toBe('code');
    expect(el.innerHTML).toBe('<b>x</b>');
    el.dispatchEvent(new Event('click'));
    expect(clicked).toBe(true);
  });

  it('throws when both innerHTML and children are provided', () => {
    expect(() => jsx('pre', { innerHTML: '<b>x</b>', children: 'y' })).toThrow(
      /innerHTML.+children/i,
    );
  });

  it('does NOT throw when children are an empty array', () => {
    const el = jsx('pre', { innerHTML: '<b>x</b>', children: [] }) as HTMLElement;
    expect(el.innerHTML).toBe('<b>x</b>');
  });

  it('does NOT throw when children is null', () => {
    const el = jsx('pre', { innerHTML: '<b>x</b>', children: null }) as HTMLElement;
    expect(el.innerHTML).toBe('<b>x</b>');
  });

  it('throws when children is 0 (numeric zero is still a child)', () => {
    expect(() => jsx('pre', { innerHTML: '<b>x</b>', children: 0 })).toThrow(
      /innerHTML.+children/i,
    );
  });

  it('throws when children is the empty string', () => {
    expect(() => jsx('pre', { innerHTML: '<b>x</b>', children: '' })).toThrow(
      /innerHTML.+children/i,
    );
  });

  it('does not throw when called imperatively on a void element (types block at callsite)', () => {
    const el = jsx('input', { innerHTML: '<b>x</b>' } as never) as HTMLInputElement;
    expect(el.tagName).toBe('INPUT');
  });

  it('supports ref callback alongside innerHTML', () => {
    let captured: Element | null = null;
    const el = jsx('pre', {
      innerHTML: '<b>x</b>',
      ref: (node: Element) => {
        captured = node;
      },
    }) as HTMLElement;
    expect(captured).toBe(el);
    expect(el.innerHTML).toBe('<b>x</b>');
  });
});
