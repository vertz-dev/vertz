import { signal } from '../runtime/signal';
import type { Signal } from '../runtime/signal-types';

export interface FieldState<T = unknown> {
  error: Signal<string | undefined>;
  dirty: Signal<boolean>;
  touched: Signal<boolean>;
  value: Signal<T>;
}

export function createFieldState<T>(_name: string, initialValue?: T): FieldState<T> {
  return {
    error: signal<string | undefined>(undefined),
    dirty: signal(false),
    touched: signal(false),
    value: signal(initialValue as T),
  };
}
