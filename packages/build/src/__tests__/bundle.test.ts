import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from '@vertz/test';
import { bundle } from '../bundle';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/simple-pkg');
const outDir = join(fixtureDir, 'dist');

afterEach(() => {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true });
  }
});

describe('bundle', () => {
  it('produces ESM output files', async () => {
    const result = await bundle({ entry: ['src/index.ts'] }, fixtureDir);
    expect(result.outputFiles.length).toBeGreaterThan(0);

    const indexFile = result.outputFiles.find((f) => f.relativePath.endsWith('index.js'));
    expect(indexFile).toBeDefined();
    expect(existsSync(indexFile!.path)).toBe(true);
  });

  it('marks dependencies as external', async () => {
    const result = await bundle({ entry: ['src/index.ts'] }, fixtureDir);

    const indexFile = result.outputFiles.find((f) => f.relativePath.endsWith('index.js'));
    const content = await readFile(indexFile!.path, 'utf-8');
    // lodash should be an external import, not bundled
    expect(content).toContain('from "lodash"');
  });

  it('respects config external entries', async () => {
    const result = await bundle({ entry: ['src/index.ts'], external: ['lodash'] }, fixtureDir);

    const indexFile = result.outputFiles.find((f) => f.relativePath.endsWith('index.js'));
    const content = await readFile(indexFile!.path, 'utf-8');
    expect(content).toContain('from "lodash"');
  });

  it('handles multi-entry builds', async () => {
    const result = await bundle({ entry: ['src/index.ts', 'src/utils.ts'] }, fixtureDir);

    const indexFile = result.outputFiles.find((f) => f.relativePath.endsWith('index.js'));
    const utilsFile = result.outputFiles.find((f) => f.relativePath.endsWith('utils.js'));
    expect(indexFile).toBeDefined();
    expect(utilsFile).toBeDefined();
  });

  it('cleans output directory when clean: true', async () => {
    // First build
    await bundle({ entry: ['src/index.ts'] }, fixtureDir);
    expect(existsSync(outDir)).toBe(true);

    // Second build with clean
    await bundle({ entry: ['src/utils.ts'], clean: true }, fixtureDir);
    expect(existsSync(outDir)).toBe(true);

    // Only utils should exist, not index (since clean removed the old output)
    const utilsPath = join(outDir, 'utils.js');
    expect(existsSync(utilsPath)).toBe(true);
  });

  it('applies banner to output', async () => {
    const result = await bundle(
      { entry: ['src/utils.ts'], banner: '#!/usr/bin/env node' },
      fixtureDir,
    );

    const utilsFile = result.outputFiles.find((f) => f.relativePath.endsWith('utils.js'));
    const content = await readFile(utilsFile!.path, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('applies banner object to output', async () => {
    const result = await bundle(
      { entry: ['src/utils.ts'], banner: { js: '/* license */' } },
      fixtureDir,
    );

    const utilsFile = result.outputFiles.find((f) => f.relativePath.endsWith('utils.js'));
    const content = await readFile(utilsFile!.path, 'utf-8');
    expect(content.startsWith('/* license */')).toBe(true);
  });

  it('uses custom outDir', async () => {
    const customOutDir = join(fixtureDir, 'build-output');
    try {
      const result = await bundle({ entry: ['src/utils.ts'], outDir: 'build-output' }, fixtureDir);
      expect(result.outDir).toBe(customOutDir);
      expect(existsSync(join(customOutDir, 'utils.js'))).toBe(true);
    } finally {
      if (existsSync(customOutDir)) {
        rmSync(customOutDir, { recursive: true });
      }
    }
  });

  it('returns output file metadata', async () => {
    const result = await bundle({ entry: ['src/utils.ts'] }, fixtureDir);

    const utilsFile = result.outputFiles.find((f) => f.relativePath.endsWith('utils.js'));
    expect(utilsFile).toBeDefined();
    expect(utilsFile!.kind).toBe('entry-point');
    expect(utilsFile!.size).toBeGreaterThan(0);
    expect(utilsFile!.relativePath).toBe('utils.js');
  });
});
