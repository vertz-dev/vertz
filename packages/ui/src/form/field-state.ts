import { signal } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';

export interface FieldState<T = unknown> {
  error: Signal<string | undefined>;
  dirty: Signal<boolean>;
  touched: Signal<boolean>;
  value: Signal<T>;
  setValue: (value: T) => void;
  reset: () => void;
}

export function createFieldState<T>(_name: string, initialValue?: T): FieldState<T> {
  const error = signal<string | undefined>(undefined);
  const dirty = signal(false);
  const touched = signal(false);
  const value = signal(initialValue as T);

  return {
    error,
    dirty,
    touched,
    value,
    setValue(newValue: T) {
      value.value = newValue;
      dirty.value = newValue !== initialValue;
    },
    reset() {
      value.value = initialValue as T;
      error.value = undefined;
      dirty.value = false;
      touched.value = false;
    },
  };
}
