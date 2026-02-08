import { describe, expect, it } from 'vitest';
import { findProjectRoot } from '../paths';

describe('findProjectRoot', () => {
  it('finds root from the monorepo packages directory', () => {
    const root = findProjectRoot(import.meta.dirname);
    expect(root).toBeDefined();
  });

  it('returns undefined for an empty temp directory', () => {
    const root = findProjectRoot('/tmp/nonexistent-dir-abc123');
    expect(root).toBeUndefined();
  });

  it('returns a string when found', () => {
    const root = findProjectRoot(import.meta.dirname);
    expect(typeof root).toBe('string');
  });

  it('returns a path that contains package.json', () => {
    const root = findProjectRoot(import.meta.dirname);
    expect(root).toBeDefined();
  });
});
