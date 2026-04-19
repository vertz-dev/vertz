/**
 * Serialize a query key (string or tuple) into a deterministic cache key string.
 *
 * String keys pass through. Tuple keys are JSON-stringified with object keys
 * sorted recursively so `{a:1,b:2}` and `{b:2,a:1}` produce the same string.
 *
 * Functions, symbols, and class instances inside tuples throw a typed error
 * that names the offending path — they cannot be deterministically serialized
 * and would silently collide or fail to round-trip otherwise.
 */
export function serializeQueryKey(key: string | readonly unknown[]): string {
  if (typeof key === 'string') return key;
  for (let i = 0; i < key.length; i++) {
    validateSerializable(key[i], [`index ${i}`]);
  }
  return JSON.stringify(key, sortObjectKeysReplacer);
}

function sortObjectKeysReplacer(_keyName: string, value: unknown): unknown {
  if (value === null) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[k] = (value as Record<string, unknown>)[k];
  }
  return sorted;
}

function validateSerializable(value: unknown, path: string[]): void {
  if (value === null) return;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'undefined') return;
  if (t === 'function' || t === 'symbol' || t === 'bigint') {
    throwUnsupported(value, path);
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      validateSerializable(value[i], [...path, String(i)]);
    }
    return;
  }
  if (t === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throwUnsupported(value, path);
    }
    for (const k of Object.keys(value as Record<string, unknown>)) {
      validateSerializable((value as Record<string, unknown>)[k], [...path, k]);
    }
  }
}

function throwUnsupported(value: unknown, path: string[]): never {
  const t = typeof value;
  const kind =
    t === 'function'
      ? 'function'
      : t === 'symbol'
        ? 'symbol'
        : t === 'bigint'
          ? 'bigint'
          : 'class instance';
  throw new TypeError(
    `serializeQueryKey: unsupported value at ${path.join('.')} — got ${kind}. ` +
      'Tuple keys must contain only strings, numbers, booleans, null, plain objects, and arrays.',
  );
}
