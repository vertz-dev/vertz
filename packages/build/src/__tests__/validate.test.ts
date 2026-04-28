import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from '@vertz/test';
import { assertOutputsUnderOutDir } from '../validate';
import type { OutputFileInfo } from '../types';

function makeFile(path: string): OutputFileInfo {
  return {
    path,
    relativePath: 'index.js',
    entrypoint: 'src/index.ts',
    kind: 'entry-point',
    size: 0,
  };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('assertOutputsUnderOutDir', () => {
  it('returns silently when every output is inside outDir', () => {
    const outDir = '/repo/packages/ui/dist';
    const files = [
      makeFile('/repo/packages/ui/dist/index.js'),
      makeFile('/repo/packages/ui/dist/chunks/foo.js'),
    ];

    expect(() => assertOutputsUnderOutDir(files, outDir)).not.toThrow();
  });

  it('throws when an output path is in a sibling package dist', () => {
    // Mirrors #2953: the ui-primitives build emitting into ui's dist.
    const outDir = '/repo/packages/ui-primitives/dist';
    const files = [
      makeFile('/repo/packages/ui-primitives/dist/index.js'),
      makeFile('/repo/packages/ui/dist/index.js'),
    ];

    expect(() => assertOutputsUnderOutDir(files, outDir)).toThrow(
      /outside the configured output directory/,
    );
  });

  it('throws when an output path is an absolute parent traversal', () => {
    const outDir = '/repo/packages/ui/dist';
    const files = [makeFile('/repo/packages/ui/dist/../leaked.js')];

    expect(() => assertOutputsUnderOutDir(files, outDir)).toThrow(/outside/);
  });

  it('error message includes both the bad path and the outDir', () => {
    const outDir = '/repo/packages/ui/dist';
    const stray = '/repo/packages/ui-primitives/dist/index.js';
    const files = [makeFile(stray)];

    expect(() => assertOutputsUnderOutDir(files, outDir)).toThrow(stray);
    expect(() => assertOutputsUnderOutDir(files, outDir)).toThrow(outDir);
  });

  it('treats a path that equals outDir exactly as outside (outDir is not a file)', () => {
    const outDir = '/repo/packages/ui/dist';
    const files = [makeFile(outDir)];

    expect(() => assertOutputsUnderOutDir(files, outDir)).toThrow(/outside/);
  });

  it('does not false-positive when outDir is a symlink to the file path’s parent', () => {
    // Real-world layout: a workspace mounted via symlink (devcontainers,
    // pnpm `node_modules/.pnpm`, /tmp ↔ /private/tmp on macOS). outDir and
    // file.path point at the same on-disk directory through different
    // symbolic routes — this must NOT trip the validator.
    const tmpRoot = mkdtempSync(join(tmpdir(), 'vtz-validate-'));
    cleanups.push(() => rmSync(tmpRoot, { recursive: true, force: true }));

    const realDir = join(tmpRoot, 'real-dist');
    mkdirSync(realDir);
    writeFileSync(join(realDir, 'index.js'), '');

    const linkDir = join(tmpRoot, 'link-dist');
    symlinkSync(realDir, linkDir);

    expect(() =>
      assertOutputsUnderOutDir([makeFile(join(realDir, 'index.js'))], linkDir),
    ).not.toThrow();
  });

  it('does not false-positive when outDir has a trailing slash', () => {
    // path.relative tolerates trailing slashes, but pin the invariant so
    // a future refactor to string-prefix matching can’t silently break it.
    const outDir = '/repo/packages/ui/dist/';
    const files = [makeFile('/repo/packages/ui/dist/index.js')];

    expect(() => assertOutputsUnderOutDir(files, outDir)).not.toThrow();
  });
});
