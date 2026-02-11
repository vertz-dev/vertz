import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import type { VariableInfo } from '../../types';
import { SignalTransformer } from '../signal-transformer';

function transform(code: string, variables: VariableInfo[]) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const s = new MagicString(code);
  const transformer = new SignalTransformer();

  for (const comp of components) {
    transformer.transform(s, sf, comp, variables);
  }

  return s.toString();
}

describe('SignalTransformer', () => {
  it('transforms let declaration to signal()', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('const count = signal(0)');
  });

  it('transforms reads to .value', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('{count.value}');
  });

  it('transforms writes to .value', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  count = 5;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('count.value = 5');
  });

  it('transforms postfix increment to .value', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  count++;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('count.value++');
  });

  it('transforms compound assignment to .value', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  count += 1;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('count.value += 1');
  });

  it('transforms both read and write in spread pattern', () => {
    const result = transform(
      `function App() {\n  let items = [];\n  items = [...items, "x"];\n  return <div>{items}</div>;\n}`,
      [{ name: 'items', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('items.value = [...items.value, "x"]');
  });
});
