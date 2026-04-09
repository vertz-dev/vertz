import { describe, expect, it } from '@vertz/test';
import { signal } from '../../runtime/signal';
import { __attr, __classList, __prop, __show } from '../attributes';

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

  it('converts object style values to CSS strings', () => {
    const el = document.createElement('div');
    const bg = signal('red');
    __attr(el, 'style', () => ({ backgroundColor: bg.value }));
    expect(el.getAttribute('style')).toBe('background-color: red');
    bg.value = 'blue';
    expect(el.getAttribute('style')).toBe('background-color: blue');
  });

  it('handles string style values unchanged', () => {
    const el = document.createElement('div');
    const color = signal('red');
    __attr(el, 'style', () => `color: ${color.value}`);
    expect(el.getAttribute('style')).toBe('color: red');
  });
});

describe('__prop', () => {
  it('sets a DOM property reactively on select element', () => {
    const el = document.createElement('select');
    const opt1 = document.createElement('option');
    opt1.value = 'a';
    const opt2 = document.createElement('option');
    opt2.value = 'b';
    el.appendChild(opt1);
    el.appendChild(opt2);

    const selected = signal('b');
    __prop(el, 'value', () => selected.value);
    expect(el.value).toBe('b');

    selected.value = 'a';
    expect(el.value).toBe('a');
  });

  it('sets input value property reactively', () => {
    const el = document.createElement('input');
    const text = signal('hello');
    __prop(el, 'value', () => text.value);
    expect(el.value).toBe('hello');

    text.value = 'world';
    expect(el.value).toBe('world');
  });

  it('sets checkbox checked property reactively', () => {
    const el = document.createElement('input');
    el.type = 'checkbox';
    const isChecked = signal(true);
    __prop(el, 'checked', () => isChecked.value);
    expect(el.checked).toBe(true);

    isChecked.value = false;
    expect(el.checked).toBe(false);
  });

  it('sets option selected property reactively', () => {
    const el = document.createElement('option');
    const isSelected = signal(true);
    __prop(el, 'selected', () => isSelected.value);
    expect(el.selected).toBe(true);

    isSelected.value = false;
    expect(el.selected).toBe(false);
  });

  it('mirrors selected property to attribute for detached-element compatibility', () => {
    const select = document.createElement('select');
    const opt1 = document.createElement('option');
    opt1.value = 'a';
    opt1.textContent = 'A';
    const opt2 = document.createElement('option');
    opt2.value = 'b';
    opt2.textContent = 'B';

    // Set selected on opt2 while it's detached from the select
    __prop(opt2, 'selected', () => true);

    // Append options to select — attribute ensures state persists through append
    select.appendChild(opt1);
    select.appendChild(opt2);

    expect(opt2.hasAttribute('selected')).toBe(true);
    expect(select.value).toBe('b');
  });

  it('removes selected attribute when value becomes falsy', () => {
    const opt = document.createElement('option');
    const isSelected = signal(true);
    __prop(opt, 'selected', () => isSelected.value);
    expect(opt.hasAttribute('selected')).toBe(true);

    isSelected.value = false;
    expect(opt.hasAttribute('selected')).toBe(false);
    expect(opt.selected).toBe(false);
  });

  it('resets value to empty string when fn returns null', () => {
    const el = document.createElement('select');
    const opt = document.createElement('option');
    opt.value = 'a';
    el.appendChild(opt);

    const selected = signal<string | null>('a');
    __prop(el, 'value', () => selected.value);
    expect(el.value).toBe('a');

    selected.value = null;
    expect(el.value).toBe('');
  });

  it('resets checked to false when fn returns null', () => {
    const el = document.createElement('input');
    el.type = 'checkbox';
    const isChecked = signal<boolean | null>(true);
    __prop(el, 'checked', () => isChecked.value);
    expect(el.checked).toBe(true);

    isChecked.value = null;
    expect(el.checked).toBe(false);
  });

  it('returns a dispose function', () => {
    const el = document.createElement('input');
    const text = signal('hello');
    const dispose = __prop(el, 'value', () => text.value);
    expect(typeof dispose).toBe('function');
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
