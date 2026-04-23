import { signal } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';

export interface FieldState<T = unknown> {
  error: Signal<string | undefined>;
  dirty: Signal<boolean>;
  touched: Signal<boolean>;
  value: Signal<T>;
  setValue: (value: T) => void;
  reset: () => void;
  /**
   * Replace the baseline value used for dirty comparison and reset().
   * If the field is not dirty, its current value is updated to `newInitial`
   * so async-loaded data flows into the UI. Dirty fields keep their user input.
   */
  setInitial: (newInitial: T) => void;
}

export function createFieldState<T>(_name: string, initialValue?: T): FieldState<T> {
  const error = signal<string | undefined>(undefined);
  const dirty = signal(false);
  const touched = signal(false);
  const value = signal(initialValue as T);
  let currentInitial = initialValue as T;

  return {
    error,
    dirty,
    touched,
    value,
    setValue(newValue: T) {
      value.value = newValue;
      dirty.value = newValue !== currentInitial;
    },
    reset() {
      value.value = currentInitial;
      error.value = undefined;
      dirty.value = false;
      touched.value = false;
    },
    setInitial(newInitial: T) {
      currentInitial = newInitial;
      if (!dirty.peek()) {
        value.value = newInitial;
      } else if (value.peek() === newInitial) {
        dirty.value = false;
      }
    },
  };
}
