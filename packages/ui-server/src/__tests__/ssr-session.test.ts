import { describe, expect, it } from '@vertz/test';
import { createSessionScript } from '../ssr-session';

describe('createSessionScript', () => {
  it('produces valid script tag with session data', () => {
    const result = createSessionScript({
      user: { id: '1', email: 'a@b.com', role: 'user' },
      expiresAt: 1700000000000,
    });

    expect(result).toContain('<script>');
    expect(result).toContain('</script>');
    expect(result).toContain('window.__VERTZ_SESSION__=');
    expect(result).toContain('"id":"1"');
    expect(result).toContain('"expiresAt":1700000000000');
  });

  it('escapes < characters (prevents script injection)', () => {
    const result = createSessionScript({
      user: { id: '1', email: '</script><script>alert(1)//', role: 'user' },
      expiresAt: 1700000000000,
    });

    expect(result).not.toContain('</script><script>');
    expect(result).toContain('\\u003c');
  });

  it('escapes line/paragraph separators', () => {
    const result = createSessionScript({
      user: { id: '1', email: 'a\u2028b\u2029c', role: 'user' },
      expiresAt: 1700000000000,
    });

    expect(result).not.toContain('\u2028');
    expect(result).not.toContain('\u2029');
  });

  it('includes nonce when provided', () => {
    const result = createSessionScript(
      { user: { id: '1', email: 'a@b.com', role: 'user' }, expiresAt: 1700000000000 },
      'abc123',
    );

    expect(result).toContain('nonce="abc123"');
  });

  it('escapes nonce attribute (prevents attribute injection)', () => {
    const result = createSessionScript(
      { user: { id: '1', email: 'a@b.com', role: 'user' }, expiresAt: 1700000000000 },
      '"><script>alert(1)</script>',
    );

    expect(result).not.toContain('"><script>alert(1)</script>');
    expect(result).toContain('nonce=');
  });

  it('works without nonce', () => {
    const result = createSessionScript({
      user: { id: '1', email: 'a@b.com', role: 'user' },
      expiresAt: 1700000000000,
    });

    expect(result).not.toContain('nonce');
    expect(result).toMatch(/^<script>/);
  });
});
