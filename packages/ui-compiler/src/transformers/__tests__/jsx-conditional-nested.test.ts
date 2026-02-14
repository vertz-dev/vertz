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

describe('JsxTransformer — conditional branch JSX (Bug #255)', () => {
  it('transforms parenthesized JSX in logical AND branch', () => {
    // Bug 1: {hasError && (<div>...</div>)} — parens around JSX in branch
    // were not unwrapped, so JSX was left as raw syntax for Vite's React transform.
    const code = `function App() {
  return (
    <div>
      {hasError && (
        <div style="color: red">
          <p>Error occurred</p>
        </div>
      )}
    </div>
  );
}`;
    const result = transform(code, [{ name: 'hasError', kind: 'signal', start: 0, end: 0 }]);

    // ALL JSX must be transformed — no raw tags should remain
    expect(result).not.toContain('<div');
    expect(result).not.toContain('<p>');
    expect(result).toContain('__conditional');
    expect(result).toContain('__element("div")');
    expect(result).toContain('__element("p")');
  });

  it('transforms parenthesized JSX in ternary branches', () => {
    const code = `function App() {
  return (
    <div>
      {isLoading ? (
        <div><h3>Loading...</h3></div>
      ) : (
        <div><h3>Done</h3></div>
      )}
    </div>
  );
}`;
    const result = transform(code, [{ name: 'isLoading', kind: 'signal', start: 0, end: 0 }]);

    expect(result).not.toContain('<div');
    expect(result).not.toContain('<h3>');
    expect(result).toContain('__conditional');
    expect(result).toContain('__element("h3")');
  });

  it('does NOT produce .node property access on __conditional result', () => {
    // Bug 2: __conditional() returns a Node (DocumentFragment) directly,
    // not an object with a .node property. Generating `.node` causes
    // appendChild(undefined) → TypeError.
    const code = `function App() {
  return (
    <div>
      {show && <span>hello</span>}
    </div>
  );
}`;
    const result = transform(code, [{ name: 'show', kind: 'signal', start: 0, end: 0 }]);

    expect(result).toContain('__conditional(');
    // Must NOT have .node suffix — __conditional IS the node
    expect(result).not.toMatch(/\)\.node/);
  });

  it('transforms complex multi-level conditional with deeply nested JSX', () => {
    // Reproduces the exact pattern from task-list.tsx that was failing
    const code = `function App() {
  return (
    <div>
      {!loading && !error && items.length === 0 && (
        <div class="empty">
          <h3>No items</h3>
          <p>Create your first item</p>
          <button onClick={onCreate}>Create</button>
        </div>
      )}
    </div>
  );
}`;
    const result = transform(code, [
      { name: 'loading', kind: 'signal', start: 0, end: 0 },
      { name: 'error', kind: 'signal', start: 0, end: 0 },
      { name: 'items', kind: 'signal', start: 0, end: 0 },
    ]);

    expect(result).not.toContain('<div');
    expect(result).not.toContain('<h3>');
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('<button');
    expect(result).toContain('__conditional');
    expect(result).toContain('__element(');
    expect(result).toContain('__on(');
  });
});
