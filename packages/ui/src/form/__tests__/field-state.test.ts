import { describe, expect, it } from 'vitest';
import { createFieldState } from '../field-state';

describe('createFieldState', () => {
  it('returns object with 4 signals at default values', () => {
    const field = createFieldState('title');

    expect(field.error.peek()).toBeUndefined();
    expect(field.dirty.peek()).toBe(false);
    expect(field.touched.peek()).toBe(false);
    expect(field.value.peek()).toBeUndefined();
  });

  it('accepts an initial value for the value signal', () => {
    const field = createFieldState('title', 'Hello');

    expect(field.value.peek()).toBe('Hello');
  });

  it('each property is a writable signal', () => {
    const field = createFieldState<string>('title', 'initial');

    field.error.value = 'Required';
    expect(field.error.peek()).toBe('Required');

    field.dirty.value = true;
    expect(field.dirty.peek()).toBe(true);

    field.touched.value = true;
    expect(field.touched.peek()).toBe(true);

    field.value.value = 'updated';
    expect(field.value.peek()).toBe('updated');
  });
});
