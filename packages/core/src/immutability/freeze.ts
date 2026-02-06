export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    deepFreeze(value);
  }
  return obj;
}
