import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from '@vertz/test';
import { build } from '../build';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/simple-pkg');
const outDir = join(fixtureDir, 'dist');

afterEach(() => {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true });
  }
});

describe('build', () => {
  it('bundles JS and generates DTS for a single config', async () => {
    await build({ entry: ['src/index.ts', 'src/utils.ts'], dts: true, clean: true }, fixtureDir);

    // JS output
    expect(existsSync(join(outDir, 'index.js'))).toBe(true);
    expect(existsSync(join(outDir, 'utils.js'))).toBe(true);

    // DTS output
    expect(existsSync(join(outDir, 'index.d.ts'))).toBe(true);
    expect(existsSync(join(outDir, 'utils.d.ts'))).toBe(true);
  });

  it('runs onSuccess hooks after bundling', async () => {
    let hookRan = false;

    await build(
      {
        entry: ['src/utils.ts'],
        dts: false,
        onSuccess: () => {
          hookRan = true;
        },
      },
      fixtureDir,
    );

    expect(hookRan).toBe(true);
  });

  it('passes output files to onSuccess hook context', async () => {
    let fileCount = 0;

    await build(
      {
        entry: ['src/utils.ts'],
        dts: false,
        onSuccess: {
          name: 'check-files',
          handler: async (ctx) => {
            fileCount = ctx.outputFiles.length;
          },
        },
      },
      fixtureDir,
    );

    expect(fileCount).toBeGreaterThan(0);
  });

  it('handles array config (builds each sequentially)', async () => {
    const customOutDir = join(fixtureDir, 'dist2');
    try {
      await build(
        [
          { entry: ['src/index.ts'], dts: false, outDir: 'dist' },
          { entry: ['src/utils.ts'], dts: false, outDir: 'dist2' },
        ],
        fixtureDir,
      );

      expect(existsSync(join(outDir, 'index.js'))).toBe(true);
      expect(existsSync(join(customOutDir, 'utils.js'))).toBe(true);
    } finally {
      if (existsSync(customOutDir)) {
        rmSync(customOutDir, { recursive: true });
      }
    }
  });

  it('externalizes package.json dependencies', async () => {
    await build({ entry: ['src/index.ts'], dts: false }, fixtureDir);

    const content = await readFile(join(outDir, 'index.js'), 'utf-8');
    expect(content).toContain('from "lodash"');
  });
});
