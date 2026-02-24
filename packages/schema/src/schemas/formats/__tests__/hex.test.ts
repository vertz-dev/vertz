import { describe, expect, it } from 'bun:test';
import { HexSchema } from '../hex';

describe('HexSchema', () => {
  it('accepts valid hex strings', () => {
    const schema = new HexSchema();
    expect(schema.parse('deadbeef')).toBe('deadbeef');
    expect(schema.parse('0123456789abcdefABCDEF')).toBe('0123456789abcdefABCDEF');
  });

  it('rejects non-hex characters', () => {
    const schema = new HexSchema();
    expect(schema.safeParse('xyz').success).toBe(false);
    expect(schema.safeParse('0x1234').success).toBe(false);
  });
});
