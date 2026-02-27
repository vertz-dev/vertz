import { describe, expect, it } from 'bun:test';
import { sha256Hex } from '../hash';

describe('sha256Hex', () => {
  it('returns a 64-char hex string', async () => {
    const result = await sha256Hex('hello');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic', async () => {
    expect(await sha256Hex('test')).toBe(await sha256Hex('test'));
  });

  it('produces different hashes for different inputs', async () => {
    expect(await sha256Hex('a')).not.toBe(await sha256Hex('b'));
  });

  it('matches known SHA-256 for empty string', async () => {
    const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(await sha256Hex('')).toBe(expected);
  });
});
