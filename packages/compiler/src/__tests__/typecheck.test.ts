import { describe, expect, it } from 'vitest';
import { parseTscOutput, typecheck } from '../typecheck';

describe('typecheck', () => {
  it('returns success for valid project', async () => {
    const result = await typecheck();

    expect(result.success).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('returns diagnostics array', async () => {
    const result = await typecheck();

    expect(Array.isArray(result.diagnostics)).toBe(true);
  });
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
