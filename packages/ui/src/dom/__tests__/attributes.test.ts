import { describe, expect, it } from 'bun:test';
import { signal } from '../../runtime/signal';
import { __attr, __classList, __show } from '../attributes';

describe('__attr', () => {
  it('sets an attribute reactively', () => {
    const el = document.createElement('div');
    const cls = signal('primary');
    __attr(el, 'class', () => cls.value);
    expect(el.getAttribute('class')).toBe('primary');
    cls.value = 'secondary';
    expect(el.getAttribute('class')).toBe('secondary');
  });

  it('sets boolean attribute to empty string when fn returns true', () => {
    const el = document.createElement('button');
    const isDisabled = signal(true);
    __attr(el, 'disabled', () => isDisabled.value);
    expect(el.getAttribute('disabled')).toBe('');
  });

  it('removes boolean attribute when fn returns false', () => {
    const el = document.createElement('button');
    const isDisabled = signal(true);
    __attr(el, 'disabled', () => isDisabled.value);
    expect(el.hasAttribute('disabled')).toBe(true);
    isDisabled.value = false;
    expect(el.hasAttribute('disabled')).toBe(false);
  });

  it('removes attribute when fn returns null', () => {
    const el = document.createElement('div');
    const disabled = signal<string | null>('true');
    __attr(el, 'disabled', () => disabled.value);
    expect(el.getAttribute('disabled')).toBe('true');
    disabled.value = null;
    expect(el.hasAttribute('disabled')).toBe(false);
  });
});

describe('__show', () => {
  it('hides element when fn returns false', () => {
    const el = document.createElement('div');
    const visible = signal(true);
    __show(el, () => visible.value);
    expect(el.style.display).not.toBe('none');
    visible.value = false;
    expect(el.style.display).toBe('none');
  });

  it('restores element display when fn returns true', () => {
    const el = document.createElement('div');
    const visible = signal(false);
    __show(el, () => visible.value);
    expect(el.style.display).toBe('none');
    visible.value = true;
    expect(el.style.display).not.toBe('none');
  });
});

describe('__classList', () => {
  it('toggles classes reactively', () => {
    const el = document.createElement('div');
    const active = signal(false);
    const disabled = signal(true);
    __classList(el, {
      active: () => active.value,
      disabled: () => disabled.value,
    });
    expect(el.classList.contains('active')).toBe(false);
    expect(el.classList.contains('disabled')).toBe(true);
    active.value = true;
    disabled.value = false;
    expect(el.classList.contains('active')).toBe(true);
    expect(el.classList.contains('disabled')).toBe(false);
  });
});
