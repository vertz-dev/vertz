/**
 * Source map line offset tests.
 *
 * Validates that the inline source map in the plugin output correctly maps
 * lines back to the original source, even when extra lines (CSS import,
 * Fast Refresh preamble) are prepended before the compiled code.
 */

import { describe, expect, it, vi } from 'bun:test';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';

import { createVertzBunPlugin } from '../plugin';

// Mock Bun.file to return test source code
const mockSource = `
import { query } from '@vertz/ui';

export default function TodoList() {
  const todos = query('todos');

  function handleToggle(id: string) {
    console.log('toggling', id);
  }

  return <div>hello</div>;
}
`.trim();

// Helper: extract inline source map from plugin output
function extractSourceMap(contents: string): TraceMap | null {
  const match = contents.match(/\/\/# sourceMappingURL=data:application\/json;base64,(.+)$/m);
  if (!match) return null;
  const json = Buffer.from(match[1], 'base64').toString('utf-8');
  return new TraceMap(json);
}

// Helper: find the 1-based line number in output for a given substring
function findLineInOutput(output: string, substring: string): number {
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(substring)) return i + 1; // 1-based
  }
  throw new Error(`Could not find "${substring}" in output`);
}

// Helper: find the 1-based line number in source for a given substring
function findLineInSource(source: string, substring: string): number {
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(substring)) return i + 1; // 1-based
  }
  throw new Error(`Could not find "${substring}" in source`);
}

describe('source map line offset', () => {
  it('should map compiled output lines back to correct original lines', async () => {
    // Create plugin with HMR + Fast Refresh (dev defaults)
    const { plugin } = createVertzBunPlugin({
      hmr: true,
      fastRefresh: true,
      projectRoot: '/test-project',
      cssOutDir: '/tmp/vertz-test-css',
    });

    // Simulate the onLoad call
    const mockBuild = {
      onLoad: vi.fn(),
    };
    plugin.setup(mockBuild as any);

    // Get the onLoad callback
    const onLoadCallback = mockBuild.onLoad.mock.calls[0][1];

    // Mock Bun.file
    const originalBunFile = Bun.file;
    // @ts-expect-error — mocking Bun.file for test
    Bun.file = (path: string) => ({
      text: async () => mockSource,
    });

    try {
      const result = await onLoadCallback({
        path: '/test-project/src/todo-list.tsx',
      });

      const { contents } = result;
      const traceMap = extractSourceMap(contents);
      expect(traceMap).not.toBeNull();

      // Find 'handleToggle' in the output and trace it back to the source
      const outputLine = findLineInOutput(contents, 'handleToggle');
      const sourceLine = findLineInSource(mockSource, 'handleToggle');

      // Trace the output position back to the original source
      const mapped = originalPositionFor(traceMap!, {
        line: outputLine,
        column: 0,
      });

      // The mapped line should match the original source line
      expect(mapped.line).toBe(sourceLine);
    } finally {
      // @ts-expect-error — restoring Bun.file
      Bun.file = originalBunFile;
    }
  });

  it('should map lines correctly when CSS is extracted', async () => {
    const sourceWithCss = `
import { css } from '@vertz/ui';

const styles = css({
  container: { color: 'red' },
});

export default function StyledComp() {
  return <div>styled</div>;
}
`.trim();

    const { plugin } = createVertzBunPlugin({
      hmr: true,
      fastRefresh: true,
      projectRoot: '/test-project',
      cssOutDir: '/tmp/vertz-test-css',
    });

    const mockBuild = { onLoad: vi.fn() };
    plugin.setup(mockBuild as any);
    const onLoadCallback = mockBuild.onLoad.mock.calls[0][1];

    const originalBunFile = Bun.file;
    // @ts-expect-error — mocking
    Bun.file = () => ({ text: async () => sourceWithCss });

    try {
      const result = await onLoadCallback({
        path: '/test-project/src/styled-comp.tsx',
      });

      const { contents } = result;
      const traceMap = extractSourceMap(contents);
      expect(traceMap).not.toBeNull();

      // The CSS import line should be prepended but not break source map alignment
      const outputLine = findLineInOutput(contents, 'StyledComp');
      const sourceLine = findLineInSource(sourceWithCss, 'StyledComp');

      const mapped = originalPositionFor(traceMap!, {
        line: outputLine,
        column: 0,
      });

      expect(mapped.line).toBe(sourceLine);
    } finally {
      // @ts-expect-error — restoring
      Bun.file = originalBunFile;
    }
  });
});
