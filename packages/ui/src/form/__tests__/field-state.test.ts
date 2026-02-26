import { describe, expect, it } from 'bun:test';
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

  describe('setValue', () => {
    it('sets the value signal and marks the field as dirty', () => {
      const field = createFieldState<string>('title', 'initial');

      field.setValue('updated');

      expect(field.value.peek()).toBe('updated');
      expect(field.dirty.peek()).toBe(true);
    });

    it('marks dirty as false when set back to initial value', () => {
      const field = createFieldState<string>('title', 'initial');

      field.setValue('changed');
      expect(field.dirty.peek()).toBe(true);

      field.setValue('initial');
      expect(field.dirty.peek()).toBe(false);
    });
  });

  describe('reset', () => {
    it('restores value to initial and clears error, dirty, touched', () => {
      const field = createFieldState<string>('title', 'initial');

      field.value.value = 'changed';
      field.error.value = 'Required';
      field.dirty.value = true;
      field.touched.value = true;

      field.reset();

      expect(field.value.peek()).toBe('initial');
      expect(field.error.peek()).toBeUndefined();
      expect(field.dirty.peek()).toBe(false);
      expect(field.touched.peek()).toBe(false);
    });

    it('restores to undefined when no initial value was provided', () => {
      const field = createFieldState<string>('title');

      field.value.value = 'something';
      field.dirty.value = true;

      field.reset();

      expect(field.value.peek()).toBeUndefined();
      expect(field.dirty.peek()).toBe(false);
    });
  });
});
