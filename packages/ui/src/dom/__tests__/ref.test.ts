import { describe, expect, it } from '@vertz/test';
import { ref } from '../../component/refs';
import { __ref } from '../ref';

describe('__ref', () => {
  it('invokes a callback ref with the element', () => {
    const el = document.createElement('div');
    let captured: Element | null = null;
    __ref(el, (node) => {
      captured = node;
    });
    expect(captured).toBe(el);
  });

  it('assigns .current on an object ref', () => {
    const el = document.createElement('span');
    const r = ref<HTMLElement>();
    __ref(el, r);
    expect(r.current).toBe(el);
  });

  it('is a no-op when ref is null or undefined', () => {
    const el = document.createElement('div');
    expect(() => __ref(el, null)).not.toThrow();
    expect(() => __ref(el, undefined)).not.toThrow();
  });

  it('does not throw when given an object without a current property', () => {
    const el = document.createElement('div');
    const emptyRef = {} as { current: HTMLElement };
    expect(() => __ref(el, emptyRef)).not.toThrow();
  });
});
