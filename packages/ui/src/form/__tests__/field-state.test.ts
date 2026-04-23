import { describe, expect, it } from '@vertz/test';
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

  describe('setInitial', () => {
    it('updates value when field is not dirty', () => {
      const field = createFieldState<string>('title', 'Old');

      field.setInitial('New');

      expect(field.value.peek()).toBe('New');
      expect(field.dirty.peek()).toBe(false);
    });

    it('preserves user input when field is dirty', () => {
      const field = createFieldState<string>('title', 'Old');

      field.setValue('User Input');
      expect(field.dirty.peek()).toBe(true);

      field.setInitial('New');

      expect(field.value.peek()).toBe('User Input');
      expect(field.dirty.peek()).toBe(true);
    });

    it('clears dirty when user input already matches new initial', () => {
      const field = createFieldState<string>('title', 'Old');

      field.setValue('Match');
      expect(field.dirty.peek()).toBe(true);

      field.setInitial('Match');

      expect(field.value.peek()).toBe('Match');
      expect(field.dirty.peek()).toBe(false);
    });

    it('updates the baseline for subsequent setValue/reset calls', () => {
      const field = createFieldState<string>('title', 'Old');

      field.setInitial('New');
      field.setValue('New');
      expect(field.dirty.peek()).toBe(false);

      field.setValue('Changed');
      expect(field.dirty.peek()).toBe(true);

      field.reset();
      expect(field.value.peek()).toBe('New');
    });
  });
});
