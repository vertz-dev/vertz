import { createImmutableProxy } from './dev-proxy';
export function makeImmutable(obj, contextName) {
  if (process.env.NODE_ENV === 'development') {
    return createImmutableProxy(obj, contextName);
  }
  return obj;
}
//# sourceMappingURL=make-immutable.js.map
