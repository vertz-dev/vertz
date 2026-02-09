import { describe, expect, it } from 'vitest';
import { mergeImports, renderImports } from '../../utils/imports';

describe('mergeImports', () => {
  it('deduplicates identical imports', () => {
    const result = mergeImports([
      { from: './types', name: 'User', isType: true },
      { from: './types', name: 'User', isType: true },
    ]);
    expect(result).toEqual([{ from: './types', name: 'User', isType: true }]);
  });

  it('keeps different names from the same module', () => {
    const result = mergeImports([
      { from: './types', name: 'User', isType: true },
      { from: './types', name: 'Post', isType: true },
    ]);
    expect(result).toHaveLength(2);
  });

  it('sorts by module path then by name', () => {
    const result = mergeImports([
      { from: './types', name: 'User', isType: true },
      { from: './client', name: 'Client', isType: false },
      { from: './types', name: 'Post', isType: true },
    ]);
    expect(result.map((i) => `${i.from}:${i.name}`)).toEqual([
      './client:Client',
      './types:Post',
      './types:User',
    ]);
  });
});

describe('renderImports', () => {
  it('renders type imports grouped by module', () => {
    const result = renderImports([
      { from: './types', name: 'Post', isType: true },
      { from: './types', name: 'User', isType: true },
    ]);
    expect(result).toBe("import type { Post, User } from './types';");
  });

  it('renders value and type imports separately for same module', () => {
    const result = renderImports([
      { from: './client', name: 'createClient', isType: false },
      { from: './client', name: 'SDKConfig', isType: true },
    ]);
    expect(result).toBe(
      "import type { SDKConfig } from './client';\nimport { createClient } from './client';",
    );
  });

  it('renders aliased imports', () => {
    const result = renderImports([
      { from: './types', name: 'User', isType: true, alias: 'UserType' },
    ]);
    expect(result).toBe("import type { User as UserType } from './types';");
  });

  it('returns empty string for empty imports', () => {
    expect(renderImports([])).toBe('');
  });

  it('renders imports from multiple modules', () => {
    const result = renderImports([
      { from: './types', name: 'User', isType: true },
      { from: '@vertz/fetch', name: 'FetchClient', isType: false },
    ]);
    expect(result).toContain("import type { User } from './types';");
    expect(result).toContain("import { FetchClient } from '@vertz/fetch';");
  });
});
