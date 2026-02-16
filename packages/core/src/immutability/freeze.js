export function deepFreeze(obj, visited = new WeakSet()) {
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
//# sourceMappingURL=freeze.js.map
