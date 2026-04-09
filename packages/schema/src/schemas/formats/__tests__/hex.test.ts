import { describe, expect, it } from '@vertz/test';
import { HexSchema } from '../hex';

describe('HexSchema', () => {
  it('accepts valid hex strings', () => {
    const schema = new HexSchema();
    expect(schema.parse('deadbeef').data).toBe('deadbeef');
    expect(schema.parse('0123456789abcdefABCDEF').data).toBe('0123456789abcdefABCDEF');
  });

  it('rejects non-hex characters', () => {
    const schema = new HexSchema();
    expect(schema.safeParse('xyz').ok).toBe(false);
    expect(schema.safeParse('0x1234').ok).toBe(false);
  });

  it('toJSONSchema includes pattern', () => {
    expect(new HexSchema().toJSONSchema()).toEqual({
      type: 'string',
      pattern: '^[0-9a-fA-F]+$',
    });
  });

  it('_clone() preserves metadata', () => {
    const schema = new HexSchema().describe('hex value');
    expect(schema.metadata.description).toBe('hex value');
    expect(schema.parse('ff').data).toBe('ff');
  });
});
