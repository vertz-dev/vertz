import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import { MutationAnalyzer } from '../../analyzers/mutation-analyzer';
import type { VariableInfo } from '../../types';
import { MutationTransformer } from '../mutation-transformer';

function transform(code: string, variables: VariableInfo[]) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const mutationAnalyzer = new MutationAnalyzer();
  const s = new MagicString(code);
  const transformer = new MutationTransformer();

  for (const comp of components) {
    const mutations = mutationAnalyzer.analyze(sf, comp, variables);
    transformer.transform(s, comp, mutations);
  }

  return s.toString();
}

describe('MutationTransformer', () => {
  it('transforms .push() to peek() + notify()', () => {
    const code = `function App() {\n  let items = [];\n  items.push("x");\n  return <div>{items}</div>;\n}`;
    const result = transform(code, [{ name: 'items', kind: 'signal', start: 0, end: 0 }]);
    expect(result).toContain('items.peek().push("x"); items.notify()');
  });

  it('transforms property assignment to peek() + notify()', () => {
    const code = `function App() {\n  let user = { name: "Alice" };\n  user.name = "Bob";\n  return <div>{user}</div>;\n}`;
    const result = transform(code, [{ name: 'user', kind: 'signal', start: 0, end: 0 }]);
    expect(result).toContain('user.peek().name = "Bob"; user.notify()');
  });

  it('transforms index assignment to peek() + notify()', () => {
    const code = `function App() {\n  let items = [1, 2, 3];\n  items[0] = 99;\n  return <div>{items}</div>;\n}`;
    const result = transform(code, [{ name: 'items', kind: 'signal', start: 0, end: 0 }]);
    expect(result).toContain('items.peek()[0] = 99; items.notify()');
  });

  it('transforms delete to peek() + notify()', () => {
    const code = `function App() {\n  let config = { debug: true };\n  delete config.debug;\n  return <div>{config}</div>;\n}`;
    const result = transform(code, [{ name: 'config', kind: 'signal', start: 0, end: 0 }]);
    expect(result).toContain('delete config.peek().debug; config.notify()');
  });

  it('transforms Object.assign to peek() + notify()', () => {
    const code = `function App() {\n  let user = {};\n  Object.assign(user, { age: 30 });\n  return <div>{user}</div>;\n}`;
    const result = transform(code, [{ name: 'user', kind: 'signal', start: 0, end: 0 }]);
    expect(result).toContain('Object.assign(user.peek(), { age: 30 }); user.notify()');
  });
});
