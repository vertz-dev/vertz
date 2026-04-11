import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import type { PostBuildContext } from '@vertz/build';
import { createStripDeadRequireImportsHook } from '../build-hooks';

const tmpDir = join(import.meta.dirname, '.tmp-db-build-hooks');

beforeEach(() => {
  mkdirSync(join(tmpDir, 'dist'), { recursive: true });
});

afterEach(() => {
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }
});

function makeCtx(outputFiles: PostBuildContext['outputFiles']): PostBuildContext {
  return {
    outputFiles,
    outDir: join(tmpDir, 'dist'),
    packageJson: {},
  };
}

describe('createStripDeadRequireImportsHook', () => {
  it('returns a PostBuildHook with name and handler', () => {
    const hook = createStripDeadRequireImportsHook();
    expect(hook.name).toBe('strip-dead-require-imports');
    expect(typeof hook.handler).toBe('function');
  });

  it('strips bare chunk imports from entries that have no __require', async () => {
    const entryPath = join(tmpDir, 'dist/index.js');
    await writeFile(entryPath, 'import "chunk-abc123.js";\nexport const db = {};\n');

    const hook = createStripDeadRequireImportsHook();
    await hook.handler(
      makeCtx([
        {
          path: entryPath,
          relativePath: 'index.js',
          entrypoint: 'src/index.ts',
          kind: 'entry-point',
          size: 100,
        },
      ]),
    );

    const result = await readFile(entryPath, 'utf8');
    expect(result).not.toContain('chunk-');
    expect(result).toContain('export const db');
  });

  it('strips import { __require } when __require is imported but never used in body', async () => {
    const entryPath = join(tmpDir, 'dist/index.js');
    await writeFile(
      entryPath,
      'import {\n  __require\n} from "chunk-abc123.js";\nexport const db = {};\n',
    );

    const hook = createStripDeadRequireImportsHook();
    await hook.handler(
      makeCtx([
        {
          path: entryPath,
          relativePath: 'index.js',
          entrypoint: 'src/index.ts',
          kind: 'entry-point',
          size: 100,
        },
      ]),
    );

    const result = await readFile(entryPath, 'utf8');
    expect(result).not.toContain('__require');
    expect(result).toContain('export const db');
  });

  it('leaves entries that genuinely use __require untouched', async () => {
    const entryPath = join(tmpDir, 'dist/postgres/index.js');
    mkdirSync(join(tmpDir, 'dist/postgres'), { recursive: true });
    const content =
      'import { __require } from "../chunk-abc123.js";\nconst pg = __require("pg");\n';
    await writeFile(entryPath, content);

    const hook = createStripDeadRequireImportsHook();
    await hook.handler(
      makeCtx([
        {
          path: entryPath,
          relativePath: 'postgres/index.js',
          entrypoint: 'src/postgres/index.ts',
          kind: 'entry-point',
          size: 100,
        },
      ]),
    );

    const result = await readFile(entryPath, 'utf8');
    expect(result).toBe(content);
  });

  it('skips chunks (non entry-point files)', async () => {
    const chunkPath = join(tmpDir, 'dist/chunk-abc123.js');
    const content =
      'import { createRequire } from "module";\nexport const __require = createRequire(import.meta.url);\n';
    await writeFile(chunkPath, content);

    const hook = createStripDeadRequireImportsHook();
    await hook.handler(
      makeCtx([
        {
          path: chunkPath,
          relativePath: 'chunk-abc123.js',
          entrypoint: undefined,
          kind: 'chunk',
          size: 100,
        },
      ]),
    );

    const result = await readFile(chunkPath, 'utf8');
    expect(result).toBe(content);
  });
});
