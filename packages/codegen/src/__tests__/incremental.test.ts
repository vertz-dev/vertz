import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { IncrementalResult } from '../incremental';
import { writeIncremental } from '../incremental';
import type { GeneratedFile } from '../types';

describe('writeIncremental', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'vertz-incremental-test-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('writes new files that do not exist on disk', async () => {
    const files: GeneratedFile[] = [
      { path: 'client.ts', content: '// client code' },
      { path: 'index.ts', content: '// barrel index' },
    ];

    const result = await writeIncremental(files, outputDir);

    expect(result.written).toEqual(['client.ts', 'index.ts']);
    expect(result.skipped).toEqual([]);
    expect(result.removed).toEqual([]);

    // Verify files actually written
    expect(readFileSync(join(outputDir, 'client.ts'), 'utf-8')).toBe('// client code');
    expect(readFileSync(join(outputDir, 'index.ts'), 'utf-8')).toBe('// barrel index');
  });

  it('skips files whose content has not changed', async () => {
    // Pre-populate disk with the same content
    writeFileSync(join(outputDir, 'client.ts'), '// client code', 'utf-8');

    const files: GeneratedFile[] = [{ path: 'client.ts', content: '// client code' }];

    const result = await writeIncremental(files, outputDir);

    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual(['client.ts']);
    expect(result.removed).toEqual([]);
  });

  it('overwrites files whose content has changed', async () => {
    // Pre-populate disk with old content
    writeFileSync(join(outputDir, 'client.ts'), '// old client', 'utf-8');

    const files: GeneratedFile[] = [{ path: 'client.ts', content: '// new client' }];

    const result = await writeIncremental(files, outputDir);

    expect(result.written).toEqual(['client.ts']);
    expect(result.skipped).toEqual([]);

    // Verify the new content was written
    expect(readFileSync(join(outputDir, 'client.ts'), 'utf-8')).toBe('// new client');
  });

  it('creates subdirectories for nested file paths', async () => {
    const files: GeneratedFile[] = [
      { path: 'types/users.ts', content: '// users types' },
      { path: 'types/posts.ts', content: '// posts types' },
    ];

    const result = await writeIncremental(files, outputDir);

    expect(result.written).toEqual(['types/users.ts', 'types/posts.ts']);
    expect(readFileSync(join(outputDir, 'types/users.ts'), 'utf-8')).toBe('// users types');
    expect(readFileSync(join(outputDir, 'types/posts.ts'), 'utf-8')).toBe('// posts types');
  });

  it('handles a mix of new, changed, and unchanged files', async () => {
    // Pre-populate: unchanged.ts stays the same, changed.ts will differ
    writeFileSync(join(outputDir, 'unchanged.ts'), '// same', 'utf-8');
    writeFileSync(join(outputDir, 'changed.ts'), '// old version', 'utf-8');

    const files: GeneratedFile[] = [
      { path: 'unchanged.ts', content: '// same' },
      { path: 'changed.ts', content: '// new version' },
      { path: 'brand-new.ts', content: '// brand new' },
    ];

    const result = await writeIncremental(files, outputDir);

    expect(result.written.sort()).toEqual(['brand-new.ts', 'changed.ts']);
    expect(result.skipped).toEqual(['unchanged.ts']);
    expect(result.removed).toEqual([]);
  });

  describe('clean mode', () => {
    it('removes files in outputDir that are no longer generated', async () => {
      // Pre-populate: stale.ts exists on disk but will not be in generated files
      writeFileSync(join(outputDir, 'stale.ts'), '// stale', 'utf-8');
      writeFileSync(join(outputDir, 'client.ts'), '// client code', 'utf-8');

      const files: GeneratedFile[] = [{ path: 'client.ts', content: '// client code' }];

      const result = await writeIncremental(files, outputDir, { clean: true });

      expect(result.removed).toEqual(['stale.ts']);
      expect(result.skipped).toEqual(['client.ts']);
    });

    it('removes stale files in subdirectories', async () => {
      mkdirSync(join(outputDir, 'types'), { recursive: true });
      writeFileSync(join(outputDir, 'types/old-module.ts'), '// old', 'utf-8');
      writeFileSync(join(outputDir, 'client.ts'), '// client', 'utf-8');

      const files: GeneratedFile[] = [{ path: 'client.ts', content: '// client' }];

      const result = await writeIncremental(files, outputDir, { clean: true });

      expect(result.removed).toEqual(['types/old-module.ts']);
    });

    it('does not remove files when clean is false or unset', async () => {
      writeFileSync(join(outputDir, 'stale.ts'), '// stale', 'utf-8');

      const files: GeneratedFile[] = [{ path: 'client.ts', content: '// client' }];

      const result = await writeIncremental(files, outputDir);

      expect(result.removed).toEqual([]);
    });
  });

  it('returns an IncrementalResult with correct shape', async () => {
    const files: GeneratedFile[] = [{ path: 'a.ts', content: '// a' }];

    const result: IncrementalResult = await writeIncremental(files, outputDir);

    expect(result).toHaveProperty('written');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('removed');
    expect(Array.isArray(result.written)).toBe(true);
    expect(Array.isArray(result.skipped)).toBe(true);
    expect(Array.isArray(result.removed)).toBe(true);
  });
});
