import { describe, expect, it } from 'bun:test';
import { UrlSchema } from '../url';

describe('UrlSchema', () => {
  it('accepts valid URLs', () => {
    const schema = new UrlSchema();
    expect(schema.parse('https://example.com').data).toBe('https://example.com');
    expect(schema.parse('http://example.com/path?q=1').data).toBe('http://example.com/path?q=1');
  });

  it('rejects invalid URLs', () => {
    const schema = new UrlSchema();
    expect(schema.safeParse('not-a-url').ok).toBe(false);
    expect(schema.safeParse('://missing-scheme').ok).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new UrlSchema().toJSONSchema()).toEqual({ type: 'string', format: 'uri' });
  });
});
