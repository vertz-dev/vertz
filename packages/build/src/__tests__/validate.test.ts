import { describe, expect, it } from '@vertz/test';
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
});
