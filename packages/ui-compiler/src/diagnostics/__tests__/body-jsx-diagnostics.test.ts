import { describe, expect, it } from 'bun:test';
import { Project, ts } from 'ts-morph';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import { compile } from '../../compiler';
import type { ComponentInfo } from '../../types';
import { BodyJsxDiagnostics } from '../body-jsx-diagnostics';

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

describe('BodyJsxDiagnostics', () => {
  it('flags JSX in a variable initializer in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const el = <div />;
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('jsx-outside-tree');
    expect(diags[0]?.severity).toBe('warning');
    expect(diags[0]?.line).toBeGreaterThan(0);
  });

  it('flags JSX as a function argument in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        someFunction(<div />);
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('jsx-outside-tree');
  });

  it('flags each JSX in a ternary in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const el = condition ? <A /> : <B />;
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags.filter((d) => d.code === 'jsx-outside-tree')).toHaveLength(2);
  });

  it('flags JSX in an if block in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        if (condition) {
          const el = <div />;
          container.appendChild(el);
        }
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags.filter((d) => d.code === 'jsx-outside-tree')).toHaveLength(1);
  });

  it('flags bare JSX expression statement in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        <div />;
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags.filter((d) => d.code === 'jsx-outside-tree')).toHaveLength(1);
  });

  it('flags JSX in as-cast in body (motivating example)', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const dialogContainer = (<div />) as HTMLDivElement;
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags.filter((d) => d.code === 'jsx-outside-tree')).toHaveLength(1);
  });

  it('includes fix suggestion in diagnostic', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const el = <div />;
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags[0]?.fix).toContain('document.createElement');
  });

  it('reports correct line and column', () => {
    const code = `function App() {\n  const el = <div />;\n  return <div>ok</div>;\n}`;
    const [sf, comp] = firstComponent(code);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags[0]?.line).toBe(2);
    expect(diags[0]?.column).toBeGreaterThanOrEqual(13);
  });

  // ── SHOULD NOT FLAG ──────────────────────────────────────────────

  it('does NOT flag JSX in the return statement', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        let count = 0;
        return <div>{count}</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag JSX inside an arrow function in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const fallback = () => <div>Loading</div>;
        return <div>{fallback}</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag JSX inside a function declaration in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        function renderItem() { return <div>item</div>; }
        return <div>{renderItem()}</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag JSX inside a function expression in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const render = function() { return <div>item</div>; };
        return <div>{render()}</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag JSX inside event handler in JSX', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        return <button onClick={() => { const x = <div />; }}>ok</button>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag JSX passed as props in return tree', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        return <Layout header={<Header />} footer={<Footer />} />;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag arrow expression-body component', () => {
    const sf = createSourceFile(`const App = () => <div>ok</div>;`);
    const components = new ComponentAnalyzer().analyze(sf);
    const comp = components[0];
    if (!comp) throw new Error('Expected at least one component');
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag JSX inside watch() callback in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        watch(() => theme.value, (t) => { const el = <div />; });
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag JSX inside effect() callback in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        effect(() => { const el = <div />; });
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  // ── MULTI-COMPONENT ──────────────────────────────────────────────

  it('only flags the component with body JSX when multiple components exist', () => {
    const sf = createSourceFile(`
      function Good() {
        return <div>ok</div>;
      }
      function Bad() {
        const el = <div />;
        return <div>ok</div>;
      }
    `);
    const components = new ComponentAnalyzer().analyze(sf);
    const allDiags = components.flatMap((comp) => new BodyJsxDiagnostics().analyze(sf, comp));
    const bodyJsxDiags = allDiags.filter((d) => d.code === 'jsx-outside-tree');
    expect(bodyJsxDiags).toHaveLength(1);
  });

  // ── ONLY FLAGS OUTERMOST JSX ─────────────────────────────────────

  it('flags JSX fragment in body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const el = <><div /><span /></>;
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags.filter((d) => d.code === 'jsx-outside-tree')).toHaveLength(1);
  });

  it('flags JSX in a for loop body', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        for (const item of items) {
          const el = <div />;
        }
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags.filter((d) => d.code === 'jsx-outside-tree')).toHaveLength(1);
  });

  it('flags JSX in try/catch blocks', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        try {
          const el = <div />;
        } catch (e) {
          const fallback = <span />;
        }
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags.filter((d) => d.code === 'jsx-outside-tree')).toHaveLength(2);
  });

  it('flags JSX in a switch case', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        switch (mode) {
          case 'a': const el = <div />; break;
        }
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags.filter((d) => d.code === 'jsx-outside-tree')).toHaveLength(1);
  });

  it('flags only the outermost JSX element, not children', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const el = <div><span>nested</span></div>;
        return <div>ok</div>;
      }
    `);
    const diags = new BodyJsxDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
  });

  // ── E2E via compile() ────────────────────────────────────────────

  it('compile() emits jsx-outside-tree diagnostic end-to-end', () => {
    const result = compile(`
      function App() {
        const el = <div />;
        return <div>ok</div>;
      }
    `);
    const bodyJsxDiags = result.diagnostics.filter((d) => d.code === 'jsx-outside-tree');
    expect(bodyJsxDiags).toHaveLength(1);
    expect(bodyJsxDiags[0]?.severity).toBe('warning');
    expect(bodyJsxDiags[0]?.message).toContain('hydration');
  });

  it('compile() emits no jsx-outside-tree for clean component', () => {
    const result = compile(`
      function App() {
        let count = 0;
        return <div>{count}</div>;
      }
    `);
    const bodyJsxDiags = result.diagnostics.filter((d) => d.code === 'jsx-outside-tree');
    expect(bodyJsxDiags).toHaveLength(0);
  });
});
