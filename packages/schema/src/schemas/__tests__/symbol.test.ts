import { describe, expect, it } from 'bun:test';
import { ParseError } from '../../core/errors';
import { SchemaType } from '../../core/types';
import { SymbolSchema } from '../symbol';

describe('SymbolSchema', () => {
  it('accepts symbols, rejects non-symbols', () => {
    const schema = new SymbolSchema();
    const sym = Symbol('test');
    expect(schema.parse(sym).data).toBe(sym);
    expect(schema.parse(Symbol.iterator).data).toBe(Symbol.iterator);

    for (const value of [42, 'hello', true, null, undefined, {}]) {
      const result = schema.safeParse(value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ParseError);
      }
    }
  });

  it('.toJSONSchema() returns { not: {} } since Symbol is not representable in JSON Schema', () => {
    const schema = new SymbolSchema();
    expect(schema.toJSONSchema()).toEqual({ not: {} });
  });

  it('metadata.type returns SchemaType.Symbol', () => {
    expect(new SymbolSchema().metadata.type).toBe(SchemaType.Symbol);
  });

  it('_clone() preserves metadata', () => {
    const sym = Symbol('test');
    const schema = new SymbolSchema().describe('sym field');
    expect(schema.metadata.description).toBe('sym field');
    expect(schema.parse(sym).data).toBe(sym);
  });
});
