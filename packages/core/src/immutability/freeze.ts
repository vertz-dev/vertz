export function deepFreeze<T>(obj: T, visited: WeakSet<object> = new WeakSet()): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (visited.has(obj)) {
    return obj;
  }
  visited.add(obj);
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    deepFreeze(value, visited);
  }
  return obj;
}
