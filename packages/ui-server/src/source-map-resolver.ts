/**
 * Source map resolver for mapping bundled positions back to original source.
 *
 * Used by the dev server to enrich runtime errors with original file paths,
 * line numbers, and code snippets by resolving inline source maps from
 * Bun's bundled output.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import type { SourceMapInput } from '@jridgewell/trace-mapping';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';

/** Decoded source map JSON (subset of SourceMapV3). */
export interface SourceMapJSON {
  version: number;
  sources: string[];
  mappings: string;
  names?: string[];
  sourcesContent?: (string | null)[];
  sourceRoot?: string;
}

/**
 * Extract an inline base64 source map from JavaScript content.
 * Returns the decoded JSON source map, or null if not found.
 */
export function extractInlineSourceMap(jsContent: string): SourceMapJSON | null {
  const match = jsContent.match(
    /\/\/# sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/,
  );
  if (!match?.[1]) return null;

  try {
    return JSON.parse(atob(match[1]));
  } catch {
    return null;
  }
}

/** Resolved original position from a source map. */
export interface ResolvedPosition {
  /** Relative source path (e.g. "src/components/task-card.tsx") */
  source: string;
  /** 1-based line number */
  line: number;
  /** 0-based column number */
  column: number;
  /** Symbol name at this position, if available */
  name: string | null;
}

/**
 * Resolve a generated position (line/column) to its original source position.
 * Line is 1-based, column is 0-based (matching V8 stack trace format).
 * Returns null if no mapping exists for the given position.
 */
export function resolvePosition(
  sourceMapJSON: SourceMapJSON,
  line: number,
  column: number,
): ResolvedPosition | null {
  const tracer = new TraceMap(sourceMapJSON as SourceMapInput);
  const pos = originalPositionFor(tracer, { line, column });

  if (pos.source == null) return null;

  return {
    source: pos.source,
    line: pos.line ?? 1,
    column: pos.column ?? 0,
    name: pos.name,
  };
}

/**
 * Read a specific 1-based line from a file.
 * Returns undefined if the file doesn't exist or the line is out of range.
 */
export function readLineText(filePath: string, line: number): string | undefined {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const idx = line - 1;
    if (idx < 0 || idx >= lines.length) return undefined;
    return lines[idx];
  } catch {
    return undefined;
  }
}

/** A parsed stack frame from an Error.stack string. */
export interface ParsedStackFrame {
  functionName: string | null;
  file: string;
  line: number;
  column: number;
}

/**
 * Parse V8/Chrome stack trace string into structured frames.
 * Handles both `at FnName (url:line:col)` and `at url:line:col` formats.
 */
export function parseStackFrames(stack: string): ParsedStackFrame[] {
  const frames: ParsedStackFrame[] = [];
  const lines = stack.split('\n');

  for (const line of lines) {
    // "    at FnName (url:line:col)"
    const namedMatch = line.match(/^\s+at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (namedMatch?.[1] && namedMatch[2]) {
      frames.push({
        functionName: namedMatch[1],
        file: namedMatch[2],
        line: Number(namedMatch[3]),
        column: Number(namedMatch[4]),
      });
      continue;
    }

    // "    at url:line:col"
    const anonMatch = line.match(/^\s+at\s+((?:https?:\/\/).+?):(\d+):(\d+)/);
    if (anonMatch?.[1]) {
      frames.push({
        functionName: null,
        file: anonMatch[1],
        line: Number(anonMatch[2]),
        column: Number(anonMatch[3]),
      });
    }
  }

  return frames;
}

/** A function that fetches a URL and returns its Response. */
export type FetchFn = (url: string) => Promise<Response>;

export interface SourceMapResolver {
  /**
   * Resolve a bundled URL position to the original source position.
   * Fetches the JS file (using fetchFn) if not cached, extracts its inline
   * source map, and maps the position.
   */
  resolve(
    bundledUrl: string,
    line: number,
    column: number,
    fetchFn: FetchFn,
  ): Promise<(ResolvedPosition & { absSource: string }) | null>;

  /**
   * Parse a full Error.stack, resolve each /_bun/ frame to its original
   * source, read lineText for the top frame, and return enriched error
   * details plus parsed stack.
   */
  resolveStack(
    stack: string,
    message: string,
    fetchFn: FetchFn,
  ): Promise<{
    errors: ErrorDetail[];
    parsedStack: ResolvedStackFrame[];
  }>;

  /** Clear cached source maps (call on file change). */
  invalidate(): void;
}

/** Error detail for dev server error broadcasting. */
export interface ErrorDetail {
  message: string;
  file?: string;
  absFile?: string;
  line?: number;
  column?: number;
  lineText?: string;
}

/** A resolved stack frame with original source positions. */
export interface ResolvedStackFrame {
  functionName: string | null;
  file: string;
  absFile: string;
  line: number;
  column: number;
}

/**
 * Create a source map resolver with an in-memory cache.
 * The resolver fetches bundled JS files, extracts inline source maps,
 * and maps bundled positions back to original source positions.
 */
export function createSourceMapResolver(projectRoot: string): SourceMapResolver {
  const cache = new Map<string, SourceMapJSON | null>();

  async function fetchAndCache(url: string, fetchFn: FetchFn): Promise<SourceMapJSON | null> {
    if (cache.has(url)) return cache.get(url) ?? null;

    try {
      const res = await fetchFn(url);
      const jsContent = await res.text();
      const sourceMap = extractInlineSourceMap(jsContent);
      cache.set(url, sourceMap);
      return sourceMap;
    } catch {
      cache.set(url, null);
      return null;
    }
  }

  return {
    async resolve(bundledUrl, line, column, fetchFn) {
      const sourceMap = await fetchAndCache(bundledUrl, fetchFn);
      if (!sourceMap) return null;

      const pos = resolvePosition(sourceMap, line, column);
      if (!pos) return null;

      return {
        ...pos,
        absSource: resolvePath(projectRoot, pos.source),
      };
    },

    async resolveStack(stack, message, fetchFn) {
      const frames = parseStackFrames(stack);
      const resolvedFrames: ResolvedStackFrame[] = [];
      let topResolved: (ResolvedPosition & { absSource: string }) | null = null;

      for (const frame of frames) {
        // Only resolve /_bun/ URLs (bundled client code)
        if (frame.file.includes('/_bun/')) {
          const resolved = await this.resolve(frame.file, frame.line, frame.column, fetchFn);
          if (resolved) {
            if (!topResolved) topResolved = resolved;
            resolvedFrames.push({
              functionName: frame.functionName,
              file: resolved.source,
              absFile: resolved.absSource,
              line: resolved.line,
              column: resolved.column,
            });
            continue;
          }
        }

        // Non-bundled or unresolvable frame — keep as-is
        resolvedFrames.push({
          functionName: frame.functionName,
          file: frame.file,
          absFile: frame.file,
          line: frame.line,
          column: frame.column,
        });
      }

      // Build error details from the top resolved frame
      const errors: ErrorDetail[] = [];
      if (topResolved) {
        const lineText = readLineText(topResolved.absSource, topResolved.line);
        errors.push({
          message,
          file: topResolved.source,
          absFile: topResolved.absSource,
          line: topResolved.line,
          column: topResolved.column,
          lineText,
        });
      } else {
        errors.push({ message });
      }

      return { errors, parsedStack: resolvedFrames };
    },

    invalidate() {
      cache.clear();
    },
  };
}
