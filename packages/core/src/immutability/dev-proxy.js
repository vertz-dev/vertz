export function createImmutableProxy(obj, contextName, rootName, proxyCache = new WeakMap()) {
  if (proxyCache.has(obj)) {
    return proxyCache.get(obj);
  }
  const root = rootName ?? contextName;
  const proxy = new Proxy(obj, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (value !== null && typeof value === 'object' && typeof property === 'string') {
        return createImmutableProxy(value, `${contextName}.${property}`, root, proxyCache);
      }
      return value;
    },
    set(_target, property) {
      throw new TypeError(
        `Cannot set property "${String(property)}" on ${contextName}. ${root} is immutable.`,
      );
    },
    deleteProperty(_target, property) {
      throw new TypeError(
        `Cannot delete property "${String(property)}" on ${contextName}. ${root} is immutable.`,
      );
    },
  });
  proxyCache.set(obj, proxy);
  return proxy;
}
//# sourceMappingURL=dev-proxy.js.map
