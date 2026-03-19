import { describe, expect, it } from 'bun:test';
import { Project, ts } from 'ts-morph';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import type { ComponentInfo } from '../../types';
import { SSRSafetyDiagnostics } from '../ssr-safety-diagnostics';

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

describe('SSRSafetyDiagnostics', () => {
  it('flags localStorage.getItem at component top level with warning severity', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const val = localStorage.getItem('key');
        return <div>{val}</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe('ssr-unsafe-api');
    expect(diags[0]?.severity).toBe('warning');
    expect(diags[0]?.message).toContain('localStorage');
  });

  it('flags sessionStorage at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        sessionStorage.setItem('key', 'val');
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('sessionStorage');
  });

  it('flags navigator.userAgent at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const ua = navigator.userAgent;
        return <div>{ua}</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('navigator');
  });

  it('flags document.querySelector at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const el = document.querySelector('.foo');
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('document.querySelector');
  });

  it('does NOT flag localStorage inside onMount callback', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        onMount(() => {
          localStorage.setItem('key', 'val');
        });
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag localStorage inside any arrow function', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const handler = () => {
          localStorage.setItem('key', 'val');
        };
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag typeof localStorage guard', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const hasStorage = typeof localStorage !== 'undefined';
        return <div>{String(hasStorage)}</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('flags new IntersectionObserver at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const obs = new IntersectionObserver(() => {});
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('IntersectionObserver');
  });

  it('flags requestAnimationFrame at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        requestAnimationFrame(() => {});
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('requestAnimationFrame');
  });

  it('does NOT flag browser API inside JSX event handler', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        return <button onClick={() => localStorage.setItem('key', 'val')}>ok</button>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('fix suggestion mentions onMount', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        localStorage.getItem('key');
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags[0]?.fix).toContain('onMount');
  });

  it('reports correct line and column', () => {
    const code = `function App() {\n  localStorage.getItem('key');\n  return <div>ok</div>;\n}`;
    const [sf, comp] = firstComponent(code);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags[0]?.line).toBe(2);
    expect(diags[0]?.column).toBeGreaterThanOrEqual(2);
  });

  it('does NOT flag document.createElement (covered by shim)', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const el = document.createElement('div');
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API inside an if-typeof guard block', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        if (typeof localStorage !== 'undefined') {
          localStorage.getItem('key');
        }
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API inside typeof window guard', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        if (typeof window !== 'undefined') {
          localStorage.getItem('key');
        }
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API in ternary typeof guard (true branch)', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const val = typeof localStorage !== 'undefined' ? localStorage.getItem('key') : null;
        return <div>{val}</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API inside a class method', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        class Store {
          load() { return localStorage.getItem('key'); }
        }
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API inside a function declaration', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        function doStuff() {
          localStorage.setItem('key', 'val');
        }
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('reports multiple diagnostics for multiple browser APIs', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const val = localStorage.getItem('key');
        const ua = navigator.userAgent;
        return <div>{val}{ua}</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(2);
    expect(diags[0]?.message).toContain('localStorage');
    expect(diags[1]?.message).toContain('navigator');
  });

  it('flags browser API in else branch of typeof guard', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        if (typeof localStorage !== 'undefined') {
          localStorage.getItem('key');
        } else {
          localStorage.getItem('fallback');
        }
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    // then-branch is safe (suppressed), else-branch is unsafe (flagged)
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('localStorage');
  });

  it('does NOT flag browser API in logical AND typeof guard', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        typeof localStorage !== 'undefined' && localStorage.setItem('key', 'val');
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API inside a class getter', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        class Store {
          get value() { return localStorage.getItem('key'); }
        }
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API inside a class constructor', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        class Store {
          constructor() { localStorage.setItem('init', 'true'); }
        }
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API inside a class setter', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        class Store {
          set value(v: string) { localStorage.setItem('key', v); }
        }
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('flags browser API in ternary typeof guard false branch', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const val = typeof localStorage !== 'undefined' ? null : localStorage.getItem('key');
        return <div>{val}</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('localStorage');
  });

  it('does NOT flag browser API inside a function expression', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const handler = function() {
          localStorage.setItem('key', 'val');
        };
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('flags cancelAnimationFrame at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        cancelAnimationFrame(1);
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('cancelAnimationFrame');
  });

  it('flags ResizeObserver at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const obs = new ResizeObserver(() => {});
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('ResizeObserver');
  });

  it('flags MutationObserver at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const obs = new MutationObserver(() => {});
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('MutationObserver');
  });

  it('flags requestIdleCallback at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        requestIdleCallback(() => {});
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('requestIdleCallback');
  });

  it('flags cancelIdleCallback at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        cancelIdleCallback(1);
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('cancelIdleCallback');
  });

  it('does NOT flag browser API in ternary typeof window guard (true branch)', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const val = typeof window !== 'undefined' ? localStorage.getItem('key') : null;
        return <div>{val}</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('does NOT flag browser API in logical AND typeof window guard', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        typeof window !== 'undefined' && localStorage.setItem('key', 'val');
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(0);
  });

  it('flags document.querySelectorAll at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const els = document.querySelectorAll('.foo');
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('document.querySelectorAll');
  });

  it('flags document.getElementById at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const el = document.getElementById('app');
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('document.getElementById');
  });

  it('flags document.cookie at top level', () => {
    const [sf, comp] = firstComponent(`
      function App() {
        const c = document.cookie;
        return <div>ok</div>;
      }
    `);
    const diags = new SSRSafetyDiagnostics().analyze(sf, comp);
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain('document.cookie');
  });
});
