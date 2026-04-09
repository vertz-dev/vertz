import { afterEach, describe, expect, it } from '@vertz/test';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { writeIncremental } from '../incremental';

const tmpDir = join(import.meta.dir, '__tmp_writer_test__');

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeIncremental', () => {
  it('writes new files to disk', async () => {
    const files = [
      { path: 'client.ts', content: 'export const client = {};\n' },
      { path: 'types/tasks.ts', content: 'export interface Task {}\n' },
    ];

    const result = await writeIncremental(files, tmpDir);
    expect(result.written).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.removed).toBe(0);
    expect(existsSync(join(tmpDir, 'client.ts'))).toBe(true);
    expect(existsSync(join(tmpDir, 'types/tasks.ts'))).toBe(true);
    expect(readFileSync(join(tmpDir, 'client.ts'), 'utf-8')).toBe('export const client = {};\n');
  });

  it('skips files with unchanged content', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'client.ts'), 'export const client = {};\n');

    const files = [{ path: 'client.ts', content: 'export const client = {};\n' }];

    const result = await writeIncremental(files, tmpDir);
    expect(result.written).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('overwrites files with changed content', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'client.ts'), 'old content');

    const files = [{ path: 'client.ts', content: 'new content' }];

    const result = await writeIncremental(files, tmpDir);
    expect(result.written).toBe(1);
    expect(result.skipped).toBe(0);
    expect(readFileSync(join(tmpDir, 'client.ts'), 'utf-8')).toBe('new content');
  });

  it('removes stale files when clean: true', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'stale.ts'), 'old');
    writeFileSync(join(tmpDir, 'keep.ts'), 'keep');

    const files = [{ path: 'keep.ts', content: 'keep' }];

    const result = await writeIncremental(files, tmpDir, { clean: true });
    expect(result.removed).toBe(1);
    expect(existsSync(join(tmpDir, 'stale.ts'))).toBe(false);
    expect(existsSync(join(tmpDir, 'keep.ts'))).toBe(true);
  });

  it('removes empty directories after cleaning stale files', async () => {
    mkdirSync(join(tmpDir, 'old-dir'), { recursive: true });
    writeFileSync(join(tmpDir, 'old-dir/stale.ts'), 'old');
    writeFileSync(join(tmpDir, 'keep.ts'), 'keep');

    const files = [{ path: 'keep.ts', content: 'keep' }];

    await writeIncremental(files, tmpDir, { clean: true });
    expect(existsSync(join(tmpDir, 'old-dir'))).toBe(false);
    expect(existsSync(join(tmpDir, 'keep.ts'))).toBe(true);
  });

  it('does NOT remove stale files when clean: false (default)', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'stale.ts'), 'old');

    const files = [{ path: 'new.ts', content: 'new' }];

    const result = await writeIncremental(files, tmpDir);
    expect(result.removed).toBe(0);
    expect(existsSync(join(tmpDir, 'stale.ts'))).toBe(true);
  });

  it('dryRun: true returns counts without writing', async () => {
    const files = [{ path: 'client.ts', content: 'export const client = {};\n' }];

    const result = await writeIncremental(files, tmpDir, { dryRun: true });
    expect(result.written).toBe(1);
    expect(existsSync(join(tmpDir, 'client.ts'))).toBe(false);
  });

  it('creates nested directories as needed', async () => {
    const files = [{ path: 'types/models/task.ts', content: 'export interface Task {}' }];

    const result = await writeIncremental(files, tmpDir);
    expect(result.written).toBe(1);
    expect(existsSync(join(tmpDir, 'types/models/task.ts'))).toBe(true);
  });

  it('returns accurate WriteResult with file paths', async () => {
    const files = [
      { path: 'a.ts', content: 'a' },
      { path: 'b.ts', content: 'b' },
    ];

    const result = await writeIncremental(files, tmpDir);
    expect(result.filesWritten).toContain('a.ts');
    expect(result.filesWritten).toContain('b.ts');
    expect(result.filesWritten).toHaveLength(2);
  });
});
