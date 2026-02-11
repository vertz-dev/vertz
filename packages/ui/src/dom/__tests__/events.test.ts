import { describe, expect, it } from 'vitest';
import { __on } from '../events';

describe('__on', () => {
  it('binds an event handler to an element', () => {
    const el = document.createElement('button');
    let clicked = false;
    __on(el, 'click', () => {
      clicked = true;
    });
    el.click();
    expect(clicked).toBe(true);
  });

  it('returns a cleanup function that removes the listener', () => {
    const el = document.createElement('button');
    let clickCount = 0;
    const cleanup = __on(el, 'click', () => {
      clickCount++;
    });
    el.click();
    expect(clickCount).toBe(1);
    cleanup();
    el.click();
    expect(clickCount).toBe(1);
  });
});
