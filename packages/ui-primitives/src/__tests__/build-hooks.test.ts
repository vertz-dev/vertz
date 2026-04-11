import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import type { PostBuildContext } from '@vertz/build';
import { createFixBarrelReExportsHook, createStripBareChunkImportsHook } from '../build-hooks';

const tmpDir = join(import.meta.dirname, '.tmp-build-hooks');

beforeEach(() => {
  mkdirSync(join(tmpDir, 'src'), { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }
});

describe('createFixBarrelReExportsHook', () => {
  it('returns a PostBuildHook with name and handler', () => {
    const hook = createFixBarrelReExportsHook();
    expect(hook.name).toBe('fix-barrel-re-exports');
    expect(typeof hook.handler).toBe('function');
  });

  it('rewrites barrel with proper re-exports', async () => {
    // Create source barrel
    writeFileSync(
      join(tmpDir, 'src/index.ts'),
      `export { Checkbox } from './checkbox/checkbox';\nexport type { CheckboxProps } from './checkbox/checkbox';\n`,
    );

    // Create broken built barrel (bunup style: exports without imports)
    const barrelPath = join(tmpDir, 'dist/src/index.js');
    mkdirSync(join(tmpDir, 'dist/src'), { recursive: true });
    writeFileSync(barrelPath, 'export { Checkbox };\n');

    const ctx: PostBuildContext = {
      outputFiles: [
        {
          path: barrelPath,
          relativePath: 'src/index.js',
          entrypoint: 'src/index.ts',
          kind: 'entry-point',
          size: 100,
        },
      ],
      outDir: join(tmpDir, 'dist'),
      packageJson: {},
    };

    const hook = createFixBarrelReExportsHook();
    await hook.handler(ctx);

    const result = readFileSync(barrelPath, 'utf8');
    expect(result).toContain('export { Checkbox } from "./checkbox/checkbox.js"');
    // Type-only exports should be stripped
    expect(result).not.toContain('CheckboxProps');
  });

  it('skips when no barrel found in output files', async () => {
    writeFileSync(join(tmpDir, 'src/index.ts'), '');

    const ctx: PostBuildContext = {
      outputFiles: [
        {
          path: join(tmpDir, 'dist/src/checkbox.js'),
          relativePath: 'src/checkbox.js',
          entrypoint: 'src/checkbox.ts',
          kind: 'entry-point',
          size: 100,
        },
      ],
      outDir: join(tmpDir, 'dist'),
      packageJson: {},
    };

    const hook = createFixBarrelReExportsHook();
    // Should not throw
    await hook.handler(ctx);
  });
});

describe('createStripBareChunkImportsHook', () => {
  it('returns a PostBuildHook with name and handler', () => {
    const hook = createStripBareChunkImportsHook();
    expect(hook.name).toBe('strip-bare-chunk-imports');
    expect(typeof hook.handler).toBe('function');
  });

  it('strips bare chunk imports from entry-point files', async () => {
    const entryPath = join(tmpDir, 'dist/src/checkbox.js');
    mkdirSync(join(tmpDir, 'dist/src'), { recursive: true });
    writeFileSync(
      entryPath,
      'import "../shared/chunk-abc123.js";\nexport function Checkbox() {}\n',
    );

    const ctx: PostBuildContext = {
      outputFiles: [
        {
          path: entryPath,
          relativePath: 'src/checkbox.js',
          entrypoint: 'src/checkbox.ts',
          kind: 'entry-point',
          size: 100,
        },
      ],
      outDir: join(tmpDir, 'dist'),
      packageJson: {},
    };

    const hook = createStripBareChunkImportsHook();
    await hook.handler(ctx);

    const result = readFileSync(entryPath, 'utf8');
    expect(result).not.toContain('chunk-');
    expect(result).toContain('export function Checkbox()');
  });

  it('skips the barrel file', async () => {
    const barrelPath = join(tmpDir, 'dist/src/index.js');
    mkdirSync(join(tmpDir, 'dist/src'), { recursive: true });
    writeFileSync(barrelPath, 'import "../shared/chunk-abc123.js";\nexport { Checkbox };\n');

    const ctx: PostBuildContext = {
      outputFiles: [
        {
          path: barrelPath,
          relativePath: 'src/index.js',
          entrypoint: 'src/index.ts',
          kind: 'entry-point',
          size: 100,
        },
      ],
      outDir: join(tmpDir, 'dist'),
      packageJson: {},
    };

    const hook = createStripBareChunkImportsHook();
    await hook.handler(ctx);

    // Barrel should be untouched
    const result = readFileSync(barrelPath, 'utf8');
    expect(result).toContain('chunk-');
  });

  it('skips chunks (non entry-point files)', async () => {
    const chunkPath = join(tmpDir, 'dist/shared/chunk-abc123.js');
    mkdirSync(join(tmpDir, 'dist/shared'), { recursive: true });
    writeFileSync(chunkPath, 'import "chunk-def456.js";\nexport const utils = {};\n');

    const ctx: PostBuildContext = {
      outputFiles: [
        {
          path: chunkPath,
          relativePath: 'shared/chunk-abc123.js',
          entrypoint: undefined,
          kind: 'chunk',
          size: 100,
        },
      ],
      outDir: join(tmpDir, 'dist'),
      packageJson: {},
    };

    const hook = createStripBareChunkImportsHook();
    await hook.handler(ctx);

    const result = readFileSync(chunkPath, 'utf8');
    expect(result).toContain('chunk-def456');
  });
});
