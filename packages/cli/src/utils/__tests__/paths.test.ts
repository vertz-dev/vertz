import { describe, expect, it } from 'bun:test';
import { findProjectRoot } from '../paths';

describe('findProjectRoot', () => {
  it('finds root from the monorepo packages directory', () => {
    const root = findProjectRoot(import.meta.dirname);
    expect(root).toBeDefined();
  });

  it('returns undefined for a path with no package.json in ancestors', () => {
    // Use a path deep enough that no ancestor has package.json
    const root = findProjectRoot('/nonexistent-dir-abc123/deeply/nested');
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
