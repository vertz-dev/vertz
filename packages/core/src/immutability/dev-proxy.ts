export function createImmutableProxy<T extends object>(
  obj: T,
  contextName: string,
  rootName?: string,
): T {
  const root = rootName ?? contextName;
  return new Proxy(obj, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (value !== null && typeof value === 'object' && typeof property === 'string') {
        return createImmutableProxy(value as object, `${contextName}.${property}`, root);
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
}
