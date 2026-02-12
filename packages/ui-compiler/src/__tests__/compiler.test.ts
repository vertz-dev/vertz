import { describe, expect, it } from 'vitest';
import { compile } from '../compiler';

describe('compile()', () => {
  it('returns transformed code with signals', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('signal(');
    expect(result.code).toContain('count.value');
  });

  it('returns source map with mappings', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim(),
    );

    expect(result.map).toBeDefined();
    expect(result.map.version).toBe(3);
    expect(result.map.mappings).toBeTruthy();
    expect(result.map.sources).toEqual(['input.tsx']);
  });

  it('returns diagnostics', () => {
    const result = compile(
      `
function Card({ title }) {
  return <div>{title}</div>;
}
    `.trim(),
    );

    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics[0]?.code).toBe('props-destructuring');
  });

  it('adds runtime imports based on used features', () => {
    const result = compile(
      `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim(),
    );

    expect(result.code).toContain('import { ');
    expect(result.code).toContain("from '@vertz/ui'");
    expect(result.code).toContain('signal');
    // DOM helpers import from internals subpath
    expect(result.code).toContain("from '@vertz/ui/internals'");
  });

  it('returns source unchanged when no components found', () => {
    const source = `const x = 42;`;
    const result = compile(source);
    expect(result.code).toBe(source);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('generates internals import for DOM helpers when present in output', () => {
    // The compiler should scan its output for DOM helper calls (__conditional,
    // __list, __show, __classList) and include them in the internals import.
    // This component manually uses these helpers alongside reactive JSX.
    const result = compile(
      `
function App() {
  let count = 0;
  __show(el, () => count);
  __conditional(() => count, () => "yes", () => "no");
  __list(items, (item) => item);
  __classList(el, { active: count });
  return <div>{count}</div>;
}
      `.trim(),
    );

    const internalsImport = result.code
      .split('\n')
      .find((line) => line.includes("from '@vertz/ui/internals'"));
    expect(internalsImport).toBeDefined();
    expect(internalsImport).toContain('__conditional');
    expect(internalsImport).toContain('__list');
    expect(internalsImport).toContain('__show');
    expect(internalsImport).toContain('__classList');
  });
});
