import { describe, it, expect } from 'vitest';
import { Base64Schema } from '../base64';

describe('Base64Schema', () => {
  it('accepts valid base64 strings', () => {
    const schema = new Base64Schema();
    expect(schema.parse('SGVsbG8=')).toBe('SGVsbG8=');
    expect(schema.parse('YWJj')).toBe('YWJj');
    expect(schema.parse('YWJjZA==')).toBe('YWJjZA==');
  });

  it('rejects invalid base64 strings', () => {
    const schema = new Base64Schema();
    expect(schema.safeParse('not base64!').success).toBe(false);
    expect(schema.safeParse('abc').success).toBe(false); // length not divisible by 4
  });

  it('toJSONSchema includes contentEncoding', () => {
    expect(new Base64Schema().toJSONSchema()).toEqual({ type: 'string', contentEncoding: 'base64' });
  });
});
