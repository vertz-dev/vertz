import { describe, it, expect } from 'vitest';
import { SymbolSchema } from '../symbol';
import { ParseError } from '../../core/errors';

describe('SymbolSchema', () => {
  it('accepts symbols, rejects non-symbols', () => {
    const schema = new SymbolSchema();
    const sym = Symbol('test');
    expect(schema.parse(sym)).toBe(sym);
    expect(schema.parse(Symbol.iterator)).toBe(Symbol.iterator);

    for (const value of [42, 'hello', true, null, undefined, {}]) {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });

  it('.toJSONSchema() returns { not: {} } since Symbol is not representable in JSON Schema', () => {
    const schema = new SymbolSchema();
    expect(schema.toJSONSchema()).toEqual({ not: {} });
  });
});
