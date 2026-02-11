import { describe, expect, it } from 'vitest';
import vertzUiPlugin from '../vite-plugin';

describe('Vite Plugin', () => {
  it('has name and transform', () => {
    const plugin = vertzUiPlugin();
    expect(plugin.name).toBe('vertz-ui-compiler');
    expect(typeof plugin.transform).toBe('function');
  });

  it('transforms .tsx files', () => {
    const plugin = vertzUiPlugin();
    const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim();

    // Call transform directly
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: unknown } | undefined;
    const result = transform.call(plugin, code, 'component.tsx');

    expect(result).toBeDefined();
    expect(result?.code).toContain('signal(');
  });

  it('skips non-tsx files', () => {
    const plugin = vertzUiPlugin();
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: unknown } | undefined;
    const result = transform.call(plugin, 'const x = 1;', 'file.ts');

    expect(result).toBeUndefined();
  });

  it('includes source map in result', () => {
    const plugin = vertzUiPlugin();
    const code = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}
    `.trim();

    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: unknown } | undefined;
    const result = transform.call(plugin, code, 'component.tsx');

    expect(result).toBeDefined();
    expect(result?.map).toBeDefined();
  });
});
