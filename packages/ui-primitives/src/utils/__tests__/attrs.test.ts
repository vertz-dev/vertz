import { describe, expect, it } from 'bun:test';
import { applyAttrs } from '../attrs';

describe('applyAttrs', () => {
  it('sets string attributes on the element', () => {
    const el = document.createElement('div');
    applyAttrs(el, { id: 'test', title: 'hello' });
    expect(el.getAttribute('id')).toBe('test');
    expect(el.getAttribute('title')).toBe('hello');
  });

  it('sets data-* attributes', () => {
    const el = document.createElement('div');
    applyAttrs(el, { 'data-testid': 'my-btn', 'data-value': '42' });
    expect(el.getAttribute('data-testid')).toBe('my-btn');
    expect(el.getAttribute('data-value')).toBe('42');
  });

  it('sets aria-* attributes', () => {
    const el = document.createElement('div');
    applyAttrs(el, { 'aria-label': 'Close', 'aria-hidden': 'true' });
    expect(el.getAttribute('aria-label')).toBe('Close');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('appends class to existing className', () => {
    const el = document.createElement('div');
    el.setAttribute('class', 'existing');
    applyAttrs(el, { class: 'added' });
    expect(el.getAttribute('class')).toBe('existing added');
  });

  it('sets class when none exists', () => {
    const el = document.createElement('div');
    applyAttrs(el, { class: 'my-class' });
    expect(el.getAttribute('class')).toBe('my-class');
  });

  it('appends style to existing style', () => {
    const el = document.createElement('div');
    el.setAttribute('style', 'color: red');
    applyAttrs(el, { style: 'font-size: 16px' });
    const style = el.getAttribute('style')!;
    expect(style).toContain('color: red');
    expect(style).toContain('font-size: 16px');
  });

  it('skips null and undefined values', () => {
    const el = document.createElement('div');
    applyAttrs(el, { id: undefined, title: null } as Record<string, unknown>);
    expect(el.hasAttribute('id')).toBe(false);
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('overrides existing attributes (user wins)', () => {
    const el = document.createElement('div');
    el.setAttribute('id', 'generated-123');
    applyAttrs(el, { id: 'custom-id' });
    expect(el.getAttribute('id')).toBe('custom-id');
  });
});
