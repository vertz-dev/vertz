import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from '@vertz/test';
import { generateDts } from '../dts';

const fixtureDir = resolve(import.meta.dirname, 'fixtures/simple-pkg');
const outDir = join(fixtureDir, 'dist');

afterEach(() => {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true });
  }
});

describe('generateDts', () => {
  it('produces .d.ts files in output directory', async () => {
    await generateDts({ entry: ['src/index.ts'], dts: true }, fixtureDir);

    expect(existsSync(join(outDir, 'index.d.ts'))).toBe(true);
    expect(existsSync(join(outDir, 'utils.d.ts'))).toBe(true);
  });

  it('skips when dts is false', async () => {
    await generateDts({ entry: ['src/index.ts'], dts: false }, fixtureDir);

    expect(existsSync(outDir)).toBe(false);
  });

  it('skips when dts is undefined', async () => {
    await generateDts({ entry: ['src/index.ts'] }, fixtureDir);

    expect(existsSync(outDir)).toBe(false);
  });

  it('uses custom outDir', async () => {
    const customOutDir = join(fixtureDir, 'types-out');
    try {
      await generateDts(
        { entry: ['src/index.ts'], dts: true, outDir: 'types-out' },
        fixtureDir,
      );
      expect(existsSync(join(customOutDir, 'index.d.ts'))).toBe(true);
    } finally {
      if (existsSync(customOutDir)) {
        rmSync(customOutDir, { recursive: true });
      }
    }
  });
});
