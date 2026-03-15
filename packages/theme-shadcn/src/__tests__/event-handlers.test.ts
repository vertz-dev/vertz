import { describe, expect, it } from 'bun:test';
import { isKnownEventHandler, wireEventHandlers } from '../event-handlers';

describe('wireEventHandlers', () => {
  it('wires onClick as a click listener', () => {
    const el = document.createElement('button');
    let clicked = false;
    wireEventHandlers(el, {
      onClick: () => {
        clicked = true;
      },
    });
    el.click();
    expect(clicked).toBe(true);
  });

  it('wires onFocus as a focus listener', () => {
    const el = document.createElement('button');
    let focused = false;
    wireEventHandlers(el, {
      onFocus: () => {
        focused = true;
      },
    });
    el.dispatchEvent(new FocusEvent('focus'));
    expect(focused).toBe(true);
  });

  it('wires onKeyDown as a keydown listener', () => {
    const el = document.createElement('button');
    let keyPressed = '';
    wireEventHandlers(el, {
      onKeyDown: ((e: KeyboardEvent) => {
        keyPressed = e.key;
      }) as (event: KeyboardEvent) => void,
    });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(keyPressed).toBe('Enter');
  });

  it('ignores unknown properties that start with "on"', () => {
    const el = document.createElement('button');
    // @ts-expect-error — testing runtime safety with invalid prop
    wireEventHandlers(el, { onion: () => {} });
    // Should not throw, and should not add a listener for 'ion'
    expect(true).toBe(true);
  });

  it('ignores arbitrary non-event properties', () => {
    const el = document.createElement('button');
    // @ts-expect-error — testing runtime safety with invalid prop
    wireEventHandlers(el, { 'aria-label': 'test', 'data-foo': 'bar' });
    // Should not set any attributes
    expect(el.getAttribute('aria-label')).toBeNull();
    expect(el.getAttribute('data-foo')).toBeNull();
  });

  it('skips undefined handler values', () => {
    const el = document.createElement('button');
    wireEventHandlers(el, { onClick: undefined });
    // Should not throw
    el.click();
    expect(true).toBe(true);
  });

  it('Button attr loop skips known event handlers via isKnownEventHandler', () => {
    expect(isKnownEventHandler('onClick')).toBe(true);
    expect(isKnownEventHandler('onKeyDown')).toBe(true);
    expect(isKnownEventHandler('onion')).toBe(false);
    expect(isKnownEventHandler('aria-label')).toBe(false);
    expect(isKnownEventHandler('data-testid')).toBe(false);
  });

  it('wires onInput as an input listener', () => {
    const el = document.createElement('input');
    let fired = false;
    wireEventHandlers(el, {
      onInput: () => {
        fired = true;
      },
    });
    el.dispatchEvent(new Event('input'));
    expect(fired).toBe(true);
  });

  it('wires onChange as a change listener', () => {
    const el = document.createElement('input');
    let fired = false;
    wireEventHandlers(el, {
      onChange: () => {
        fired = true;
      },
    });
    el.dispatchEvent(new Event('change'));
    expect(fired).toBe(true);
  });

  it('recognizes onInput and onChange as known event handlers', () => {
    expect(isKnownEventHandler('onInput')).toBe(true);
    expect(isKnownEventHandler('onChange')).toBe(true);
  });

  it('wires multiple handlers at once', () => {
    const el = document.createElement('button');
    let clicked = false;
    let focused = false;
    wireEventHandlers(el, {
      onClick: () => {
        clicked = true;
      },
      onFocus: () => {
        focused = true;
      },
    });
    el.click();
    el.dispatchEvent(new FocusEvent('focus'));
    expect(clicked).toBe(true);
    expect(focused).toBe(true);
  });
});
