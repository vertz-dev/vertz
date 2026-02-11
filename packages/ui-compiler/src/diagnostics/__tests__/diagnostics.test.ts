import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import type { ComponentInfo, VariableInfo } from '../../types';
import { MutationDiagnostics } from '../mutation-diagnostics';
import { PropsDestructuringDiagnostics } from '../props-destructuring';

function createSourceFile(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  return project.createSourceFile('test.tsx', code);
}

function firstComponent(code: string): [ReturnType<typeof createSourceFile>, ComponentInfo] {
  const sf = createSourceFile(code);
  const components = new ComponentAnalyzer().analyze(sf);
  const comp = components[0];
  if (!comp) throw new Error('Expected at least one component');
  return [sf, comp];
}

describe('MutationDiagnostics', () => {
  it('flags .push() on const referenced in JSX', () => {
    const code = `function App() {\n  const items = [];\n  items.push("x");\n  return <div>{items}</div>;\n}`;
    const [sf, comp] = firstComponent(code);
    const variables: VariableInfo[] = [{ name: 'items', kind: 'static', start: 0, end: 0 }];

    const diags = new MutationDiagnostics().analyze(sf, comp, variables);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('non-reactive-mutation');
    expect(diags[0]?.fix).toContain('let');
  });

  it('does NOT flag .push() on const NOT in JSX', () => {
    const code = `function App() {\n  const items = [];\n  items.push("x");\n  return <div>hello</div>;\n}`;
    const [sf, comp] = firstComponent(code);
    const variables: VariableInfo[] = [{ name: 'items', kind: 'static', start: 0, end: 0 }];

    const diags = new MutationDiagnostics().analyze(sf, comp, variables);
    expect(diags).toHaveLength(0);
  });

  it('includes fix suggestion with let', () => {
    const code = `function App() {\n  const items = [];\n  items.push("x");\n  return <div>{items}</div>;\n}`;
    const [sf, comp] = firstComponent(code);
    const variables: VariableInfo[] = [{ name: 'items', kind: 'static', start: 0, end: 0 }];

    const diags = new MutationDiagnostics().analyze(sf, comp, variables);
    expect(diags[0]?.fix).toContain('let items');
  });
});

describe('PropsDestructuringDiagnostics', () => {
  it('flags destructured props in component parameter', () => {
    const code = `function Card({ title }) {\n  return <div>{title}</div>;\n}`;
    const sf = createSourceFile(code);
    const components = new ComponentAnalyzer().analyze(sf);

    const diags = new PropsDestructuringDiagnostics().analyze(sf, components);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('props-destructuring');
  });

  it('does NOT flag non-destructured props', () => {
    const code = `function Card(props) {\n  return <div>{props.title}</div>;\n}`;
    const sf = createSourceFile(code);
    const components = new ComponentAnalyzer().analyze(sf);

    const diags = new PropsDestructuringDiagnostics().analyze(sf, components);
    expect(diags).toHaveLength(0);
  });
});
