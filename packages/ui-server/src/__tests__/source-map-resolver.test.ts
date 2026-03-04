import { describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createSourceMapResolver,
  extractInlineSourceMap,
  type ParsedStackFrame,
  parseStackFrames,
  type ResolvedPosition,
  readLineText,
  resolvePosition,
} from '../source-map-resolver';

describe('extractInlineSourceMap', () => {
  it('extracts and decodes base64 inline source map from JS content', () => {
    const sourceMap = { version: 3, sources: ['test.ts'], mappings: 'AAAA' };
    const base64 = btoa(JSON.stringify(sourceMap));
    const jsContent = `console.log("hello");\n//# sourceMappingURL=data:application/json;base64,${base64}\n`;

    const result = extractInlineSourceMap(jsContent);

    expect(result).toEqual(sourceMap);
  });

  it('returns null when no sourceMappingURL present', () => {
    const jsContent = 'console.log("hello");';

    const result = extractInlineSourceMap(jsContent);

    expect(result).toBeNull();
  });

  it('returns null for non-inline (file URL) sourceMappingURL', () => {
    const jsContent = 'console.log("hello");\n//# sourceMappingURL=app.js.map\n';

    const result = extractInlineSourceMap(jsContent);

    expect(result).toBeNull();
  });
});

describe('resolvePosition', () => {
  it('maps bundled line/column to original source position', () => {
    // A minimal source map: line 1, col 0 of generated maps to line 1, col 0 of "input.ts"
    // VLQ "AAAA" = source 0, source line 0, source col 0, name 0
    const sourceMapJSON = {
      version: 3,
      sources: ['input.ts'],
      names: ['hello'],
      mappings: 'AAAA',
    };

    const result = resolvePosition(sourceMapJSON, 1, 0);

    expect(result).not.toBeNull();
    expect(result!.source).toBe('input.ts');
    expect(result!.line).toBe(1);
    expect(result!.column).toBe(0);
  });

  it('returns null when position has no mapping', () => {
    const sourceMapJSON = {
      version: 3,
      sources: ['input.ts'],
      names: [],
      mappings: 'AAAA', // Only maps line 1
    };

    // Line 100 has no mapping
    const result = resolvePosition(sourceMapJSON, 100, 0);

    expect(result).toBeNull();
  });
});

describe('readLineText', () => {
  it('reads the specified 1-based line from a file', () => {
    const dir = join(tmpdir(), `vertz-smap-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'test.ts');
    writeFileSync(file, 'line one\nline two\nline three\n');

    try {
      expect(readLineText(file, 1)).toBe('line one');
      expect(readLineText(file, 2)).toBe('line two');
      expect(readLineText(file, 3)).toBe('line three');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns undefined for non-existent file', () => {
    expect(readLineText('/nonexistent/file.ts', 1)).toBeUndefined();
  });

  it('returns undefined for out-of-range line number', () => {
    const dir = join(tmpdir(), `vertz-smap-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'test.ts');
    writeFileSync(file, 'only one line');

    try {
      expect(readLineText(file, 99)).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('parseStackFrames', () => {
  it('parses V8 stack frames with function name', () => {
    const stack = [
      'ReferenceError: foo is not defined',
      '    at TaskCard (http://localhost:3000/_bun/client/abc.js:42:15)',
      '    at render (http://localhost:3000/_bun/client/abc.js:100:3)',
    ].join('\n');

    const frames = parseStackFrames(stack);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({
      functionName: 'TaskCard',
      file: 'http://localhost:3000/_bun/client/abc.js',
      line: 42,
      column: 15,
    });
    expect(frames[1]).toEqual({
      functionName: 'render',
      file: 'http://localhost:3000/_bun/client/abc.js',
      line: 100,
      column: 3,
    });
  });

  it('parses V8 stack frames without function name', () => {
    const stack = ['Error: test', '    at http://localhost:3000/_bun/client/abc.js:10:5'].join(
      '\n',
    );

    const frames = parseStackFrames(stack);

    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({
      functionName: null,
      file: 'http://localhost:3000/_bun/client/abc.js',
      line: 10,
      column: 5,
    });
  });

  it('returns empty array for stack with no frames', () => {
    expect(parseStackFrames('Error: test')).toEqual([]);
    expect(parseStackFrames('')).toEqual([]);
  });
});

describe('createSourceMapResolver', () => {
  /** Helper: build JS content with an inline source map. */
  function jsWithSourceMap(sourceMapJSON: Record<string, unknown>): string {
    const base64 = btoa(JSON.stringify(sourceMapJSON));
    return `console.log("hello");\n//# sourceMappingURL=data:application/json;base64,${base64}\n`;
  }

  describe('resolve()', () => {
    it('fetches JS, extracts source map, and resolves position', async () => {
      const sourceMap = {
        version: 3,
        sources: ['src/app.tsx'],
        names: [],
        mappings: 'AAAA',
      };
      const jsContent = jsWithSourceMap(sourceMap);
      const fetchFn = async () => new Response(jsContent);

      const resolver = createSourceMapResolver('/project');
      const result = await resolver.resolve(
        'http://localhost:3000/_bun/client/abc.js',
        1,
        0,
        fetchFn,
      );

      expect(result).not.toBeNull();
      expect(result!.source).toBe('src/app.tsx');
      expect(result!.line).toBe(1);
    });

    it('caches source map — second resolve does not re-fetch', async () => {
      const sourceMap = {
        version: 3,
        sources: ['src/app.tsx'],
        names: [],
        mappings: 'AAAA',
      };
      const jsContent = jsWithSourceMap(sourceMap);
      let fetchCount = 0;
      const fetchFn = async () => {
        fetchCount++;
        return new Response(jsContent);
      };

      const resolver = createSourceMapResolver('/project');
      await resolver.resolve('http://localhost:3000/_bun/client/abc.js', 1, 0, fetchFn);
      await resolver.resolve('http://localhost:3000/_bun/client/abc.js', 1, 0, fetchFn);

      expect(fetchCount).toBe(1);
    });

    it('returns null when fetch fails', async () => {
      const fetchFn = async () => {
        throw new Error('network error');
      };

      const resolver = createSourceMapResolver('/project');
      const result = await resolver.resolve(
        'http://localhost:3000/_bun/client/abc.js',
        1,
        0,
        fetchFn,
      );

      expect(result).toBeNull();
    });

    it('returns null when JS has no inline source map', async () => {
      const fetchFn = async () => new Response('console.log("no map")');

      const resolver = createSourceMapResolver('/project');
      const result = await resolver.resolve(
        'http://localhost:3000/_bun/client/abc.js',
        1,
        0,
        fetchFn,
      );

      expect(result).toBeNull();
    });
  });

  describe('resolveStack()', () => {
    it('resolves /_bun/ frames and returns enriched errors with parsedStack', async () => {
      const sourceMap = {
        version: 3,
        sources: ['src/components/task-card.tsx'],
        names: [],
        mappings: 'AAAA',
      };
      const jsContent = jsWithSourceMap(sourceMap);
      const fetchFn = async () => new Response(jsContent);

      const stack = [
        'ReferenceError: NonExistentComponent is not defined',
        '    at TaskCard (http://localhost:3000/_bun/client/abc.js:1:0)',
      ].join('\n');

      const resolver = createSourceMapResolver('/project');
      const result = await resolver.resolveStack(
        stack,
        'NonExistentComponent is not defined',
        fetchFn,
      );

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.file).toBe('src/components/task-card.tsx');
      expect(result.errors[0]!.line).toBe(1);
      expect(result.errors[0]!.message).toBe('NonExistentComponent is not defined');

      expect(result.parsedStack).toHaveLength(1);
      expect(result.parsedStack[0]!.file).toBe('src/components/task-card.tsx');
      expect(result.parsedStack[0]!.functionName).toBe('TaskCard');
    });

    it('falls back to message-only error when no frames resolve', async () => {
      const fetchFn = async () => new Response('no source map');

      const stack = ['Error: test', '    at http://localhost:3000/_bun/client/abc.js:1:0'].join(
        '\n',
      );

      const resolver = createSourceMapResolver('/project');
      const result = await resolver.resolveStack(stack, 'test error', fetchFn);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toBe('test error');
      expect(result.errors[0]!.file).toBeUndefined();
    });
  });

  describe('invalidate()', () => {
    it('clears cache so next resolve re-fetches', async () => {
      const sourceMap = {
        version: 3,
        sources: ['src/app.tsx'],
        names: [],
        mappings: 'AAAA',
      };
      const jsContent = jsWithSourceMap(sourceMap);
      let fetchCount = 0;
      const fetchFn = async () => {
        fetchCount++;
        return new Response(jsContent);
      };

      const resolver = createSourceMapResolver('/project');
      await resolver.resolve('http://localhost:3000/_bun/client/abc.js', 1, 0, fetchFn);
      expect(fetchCount).toBe(1);

      resolver.invalidate();
      await resolver.resolve('http://localhost:3000/_bun/client/abc.js', 1, 0, fetchFn);
      expect(fetchCount).toBe(2);
    });
  });
});
