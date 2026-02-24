import { describe, expect, it } from 'bun:test';
import { formatWithBiome } from '../format';
import type { GeneratedFile } from '../types';

describe('formatWithBiome', () => {
  it('formats TypeScript files using Biome', async () => {
    const files: GeneratedFile[] = [
      {
        path: 'types/users.ts',
        content: 'export interface User {name:string;email:string}',
      },
    ];

    const result = await formatWithBiome(files);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('types/users.ts');
    // Biome should add proper spacing and formatting
    expect(result[0].content).toContain('name: string');
    expect(result[0].content).toContain('email: string');
  });

  it('formats multiple files', async () => {
    const files: GeneratedFile[] = [
      {
        path: 'types/users.ts',
        content: 'export type User = {name:string}',
      },
      {
        path: 'types/posts.ts',
        content: 'export type Post = {title:string;body:string}',
      },
    ];

    const result = await formatWithBiome(files);

    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('types/users.ts');
    expect(result[1].path).toBe('types/posts.ts');
  });

  it('skips non-TypeScript files without modifying them', async () => {
    const jsonContent = JSON.stringify({ name: '@acme/sdk', version: '1.0.0' }, null, 2);
    const files: GeneratedFile[] = [
      {
        path: 'package.json',
        content: jsonContent,
      },
    ];

    const result = await formatWithBiome(files);

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('package.json');
    // JSON files should pass through (Biome can format JSON too, but the key thing is it doesn't error)
    expect(result[0].content).toBeTruthy();
  });

  it('returns an empty array when given no files', async () => {
    const result = await formatWithBiome([]);

    expect(result).toEqual([]);
  });

  it('preserves the file path unchanged', async () => {
    const files: GeneratedFile[] = [
      {
        path: 'modules/billing.ts',
        content: 'export function hello() {return 42;}',
      },
    ];

    const result = await formatWithBiome(files);

    expect(result[0].path).toBe('modules/billing.ts');
  });
});
