import { describe, expect, it } from '@vertz/test';
import { applyProps } from '../props';

describe('applyProps', () => {
  it('wires event handlers onto the element', () => {
    const el = document.createElement('button');
    let clicked = false;
    applyProps(el, {
      onClick: () => {
        clicked = true;
      },
    });
    el.click();
    expect(clicked).toBe(true);
  });

  it('sets data-* attributes', () => {
    const el = document.createElement('button');
    applyProps(el, { 'data-testid': 'my-btn', 'data-value': '42' });
    expect(el.getAttribute('data-testid')).toBe('my-btn');
    expect(el.getAttribute('data-value')).toBe('42');
  });

  it('sets aria-* attributes', () => {
    const el = document.createElement('button');
    applyProps(el, { 'aria-label': 'Close', 'aria-hidden': 'true' });
    expect(el.getAttribute('aria-label')).toBe('Close');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('skips null and undefined values', () => {
    const el = document.createElement('button');
    applyProps(el, { id: undefined, title: null } as Record<string, unknown>);
    expect(el.getAttribute('id')).toBeNull();
    expect(el.getAttribute('title')).toBeNull();
  });

  it('does not set event handlers as attributes', () => {
    const el = document.createElement('button');
    applyProps(el, { onClick: () => {}, onFocus: () => {} });
    expect(el.getAttribute('onclick')).toBeNull();
    expect(el.getAttribute('onClick')).toBeNull();
    expect(el.getAttribute('onfocus')).toBeNull();
    expect(el.getAttribute('onFocus')).toBeNull();
  });

  it('handles mixed event handlers and attributes in one call', () => {
    const el = document.createElement('button');
    let clicked = false;
    applyProps(el, {
      onClick: () => {
        clicked = true;
      },
      'data-testid': 'my-btn',
      'aria-label': 'Close',
    });
    el.click();
    expect(clicked).toBe(true);
    expect(el.getAttribute('data-testid')).toBe('my-btn');
    expect(el.getAttribute('aria-label')).toBe('Close');
  });

  it('merges class into existing class (delegates to applyAttrs)', () => {
    const el = document.createElement('button');
    el.setAttribute('class', 'existing');
    applyProps(el, { class: 'added' });
    expect(el.getAttribute('class')).toBe('existing added');
  });

  it('appends style to existing style (delegates to applyAttrs)', () => {
    const el = document.createElement('button');
    el.setAttribute('style', 'color: red');
    applyProps(el, { style: 'font-size: 16px' });
    expect(el.getAttribute('style')).toBe('color: red; font-size: 16px');
  });
});
