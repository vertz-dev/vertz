import type { DeepReadonly } from '../types/deep-readonly';
import { createImmutableProxy } from './dev-proxy';

export function makeImmutable<T extends object>(obj: T, contextName: string): DeepReadonly<T> {
  if (process.env.NODE_ENV === 'development') {
    return createImmutableProxy(obj, contextName) as DeepReadonly<T>;
  }
  return obj as DeepReadonly<T>;
}
