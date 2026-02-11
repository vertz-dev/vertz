import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import { JsxAnalyzer } from '../../analyzers/jsx-analyzer';
import type { VariableInfo } from '../../types';
import { JsxTransformer } from '../jsx-transformer';

function transform(code: string, variables: VariableInfo[]) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const jsxAnalyzer = new JsxAnalyzer();
  const s = new MagicString(code);
  const transformer = new JsxTransformer();

  for (const comp of components) {
    const jsxExprs = jsxAnalyzer.analyze(sf, comp, variables);
    transformer.transform(s, sf, comp, variables, jsxExprs);
  }

  return s.toString();
}

describe('PropTransformer (via JsxTransformer)', () => {
  it('transforms reactive prop to getter', () => {
    const result = transform(`function Parent() {\n  return <Child value={count} />;\n}`, [
      { name: 'count', kind: 'signal', start: 0, end: 0 },
    ]);
    expect(result).toContain('get value()');
    expect(result).toContain('return count');
  });

  it('transforms static prop to plain value', () => {
    const result = transform(`function Parent() {\n  return <Child label="Count" />;\n}`, []);
    expect(result).toContain('label: "Count"');
  });

  it('handles mixed reactive and static props', () => {
    const result = transform(
      `function Parent() {\n  return <Child value={count} label="Count" />;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('get value()');
    expect(result).toContain('label: "Count"');
  });

  it('transforms computed prop to getter too', () => {
    const result = transform(`function Parent() {\n  return <Child total={derived} />;\n}`, [
      { name: 'derived', kind: 'computed', start: 0, end: 0 },
    ]);
    expect(result).toContain('get total()');
    expect(result).toContain('return derived');
  });
});
