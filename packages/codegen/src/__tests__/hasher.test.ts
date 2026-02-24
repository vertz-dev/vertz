import { describe, expect, it } from 'bun:test';
import { hashContent } from '../hasher';

describe('hashContent', () => {
  it('returns a string hash for given content', () => {
    const hash = hashContent('hello world');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('is deterministic — same content always produces the same hash', () => {
    const a = hashContent('export const foo = 42;');
    const b = hashContent('export const foo = 42;');
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', () => {
    const a = hashContent('export const foo = 42;');
    const b = hashContent('export const foo = 43;');
    expect(a).not.toBe(b);
  });

  it('handles empty string', () => {
    const hash = hashContent('');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('handles multi-line content', () => {
    const content = `export interface User {
  id: string;
  name: string;
  email: string;
}`;
    const hash = hashContent(content);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('is sensitive to whitespace changes', () => {
    const a = hashContent('const x = 1;');
    const b = hashContent('const  x = 1;');
    expect(a).not.toBe(b);
  });
});
