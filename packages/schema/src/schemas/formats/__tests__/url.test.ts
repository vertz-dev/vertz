import { describe, expect, it } from 'vitest';
import { UrlSchema } from '../url';

describe('UrlSchema', () => {
  it('accepts valid URLs', () => {
    const schema = new UrlSchema();
    expect(schema.parse('https://example.com')).toBe('https://example.com');
    expect(schema.parse('http://example.com/path?q=1')).toBe('http://example.com/path?q=1');
  });

  it('rejects invalid URLs', () => {
    const schema = new UrlSchema();
    expect(schema.safeParse('not-a-url').success).toBe(false);
    expect(schema.safeParse('://missing-scheme').success).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new UrlSchema().toJSONSchema()).toEqual({ type: 'string', format: 'uri' });
  });
});
