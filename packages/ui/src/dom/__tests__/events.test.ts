import { describe, expect, it } from 'bun:test';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
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

  it('registers cleanup with the current disposal scope', () => {
    const el = document.createElement('button');
    let clickCount = 0;

    const scope = pushScope();
    __on(el, 'click', () => {
      clickCount++;
    });
    popScope();

    // Handler works while scope is alive
    el.click();
    expect(clickCount).toBe(1);

    // Running scope cleanups removes the listener
    runCleanups(scope);
    el.click();
    expect(clickCount).toBe(1);
  });

  it('works without a disposal scope (no error)', () => {
    const el = document.createElement('button');
    let clicked = false;
    // No pushScope — _tryOnCleanup silently discards
    __on(el, 'click', () => {
      clicked = true;
    });
    el.click();
    expect(clicked).toBe(true);
  });
});
