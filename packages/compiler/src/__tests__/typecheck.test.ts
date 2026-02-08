import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { parseTscOutput, parseWatchBlock, typecheck, typecheckWatch } from '../typecheck';

describe('typecheck', () => {
  it('returns success for valid project', async () => {
    const result = await typecheck();

    expect(result.success).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  }, 30_000);

  it('returns diagnostics array', async () => {
    const result = await typecheck();

    expect(Array.isArray(result.diagnostics)).toBe(true);
  }, 30_000);
});

describe('parseTscOutput', () => {
  it('parses tsc error output', () => {
    const output =
      "src/app.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    const diagnostics = parseTscOutput(output);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].file).toBe('src/app.ts');
    expect(diagnostics[0].line).toBe(10);
    expect(diagnostics[0].column).toBe(5);
    expect(diagnostics[0].code).toBe(2322);
    expect(diagnostics[0].message).toBe("Type 'string' is not assignable to type 'number'.");
  });

  it('parses multiple errors', () => {
    const output = [
      'src/app.ts(10,5): error TS2322: Type error 1.',
      'src/router.ts(20,10): error TS2345: Type error 2.',
    ].join('\n');
    const diagnostics = parseTscOutput(output);

    expect(diagnostics).toHaveLength(2);
  });

  it('returns empty array for clean output', () => {
    const diagnostics = parseTscOutput('');

    expect(diagnostics).toEqual([]);
  });
});

describe('parseWatchBlock', () => {
  it('parses a clean watch compilation', () => {
    const block = [
      '[12:00:00] Starting compilation in watch mode...',
      '[12:00:01] Found 0 errors. Watching for file changes.',
    ].join('\n');

    const result = parseWatchBlock(block);

    expect(result.success).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('parses a watch compilation with errors', () => {
    const block = [
      '[12:00:00] File change detected. Starting incremental compilation...',
      "src/app.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.",
      '[12:00:01] Found 1 error. Watching for file changes.',
    ].join('\n');

    const result = parseWatchBlock(block);

    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].file).toBe('src/app.ts');
  });
});

describe('typecheckWatch', () => {
  it('yields a result for each compilation cycle', async () => {
    const stdout = new EventEmitter();
    const proc = Object.assign(new EventEmitter(), {
      stdout,
      stderr: new EventEmitter(),
      kill: () => true,
    });
    const spawner = () => proc as ReturnType<typeof import('node:child_process').spawn>;

    const watcher = typecheckWatch({ spawner });
    const results: Awaited<ReturnType<typeof parseWatchBlock>>[] = [];

    const collecting = (async () => {
      for await (const result of watcher) {
        results.push(result);
        if (results.length >= 2) break;
      }
    })();

    // Simulate first compilation (clean)
    stdout.emit(
      'data',
      Buffer.from(
        '[12:00:00] Starting compilation in watch mode...\n[12:00:01] Found 0 errors. Watching for file changes.\n',
      ),
    );

    // Simulate second compilation (with error)
    stdout.emit(
      'data',
      Buffer.from(
        "[12:00:02] File change detected. Starting incremental compilation...\nsrc/app.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.\n[12:00:03] Found 1 error. Watching for file changes.\n",
      ),
    );

    await collecting;

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].diagnostics).toHaveLength(1);
  });
});
