import { describe, expect, it } from 'bun:test';
import { Base64Schema } from '../base64';

describe('Base64Schema', () => {
  it('accepts valid base64 strings', () => {
    const schema = new Base64Schema();
    expect(schema.parse('SGVsbG8=').data).toBe('SGVsbG8=');
    expect(schema.parse('YWJj').data).toBe('YWJj');
    expect(schema.parse('YWJjZA==').data).toBe('YWJjZA==');
  });

  it('rejects invalid base64 strings', () => {
    const schema = new Base64Schema();
    expect(schema.safeParse('not base64!').ok).toBe(false);
    expect(schema.safeParse('abc').ok).toBe(false); // length not divisible by 4
  });

  it('toJSONSchema includes contentEncoding', () => {
    expect(new Base64Schema().toJSONSchema()).toEqual({
      type: 'string',
      contentEncoding: 'base64',
    });
  });
});
