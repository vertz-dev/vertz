import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from '@vertz/test';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' });
});
afterAll(() => {
  GlobalRegistrator.unregister();
});

// Imports must follow happy-dom registration so that @vertz/ui's auto-detected
// DOM adapter picks up the real DOM rather than failing.
import { __element, __html, __ref } from '@vertz/ui/internals';
import { ref } from '@vertz/ui';
import { compile } from '../compiler/native-compiler';

describe('Feature: ref prop across object and callback forms (issue #2788)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);
  });

  afterEach(() => {
    if (root.parentNode) document.body.removeChild(root);
  });

  describe('Given the __ref runtime helper', () => {
    it('invokes callback refs with the element', () => {
      const el = document.createElement('div');
      let captured: Element | null = null;
      __ref(el, (node) => {
        captured = node;
      });
      expect(captured).toBe(el);
    });

    it('assigns element to .current for object refs', () => {
      const el = document.createElement('span');
      const r = ref<HTMLElement>();
      __ref(el, r);
      expect(r.current).toBe(el);
    });
  });

  const hasNativeCompiler = !!(globalThis as Record<string, unknown>).__NATIVE_COMPILER_AVAILABLE__;

  describe.skipIf(!hasNativeCompiler)(
    'Given JSX with a callback ref alongside innerHTML on the same host element',
    () => {
      it('emits __ref() and never the broken `.current =` form on an arrow body', () => {
        // Exact repro from issue #2788.
        const source = `
          export function HighlightedCode({ html }) {
            return (
              <div
                className="foo"
                innerHTML={html}
                ref={(el) => { /* noop */ }}
              />
            );
          }
        `;
        const result = compile(source, { filename: 'app.tsx', target: 'dom' });
        expect(result.diagnostics).toEqual([]);
        expect(result.code).toContain('__ref(');
        expect(result.code).toContain('__html(');
        // The old (broken) emission was `(el) => { ... }.current = __el0` —
        // that member access on an arrow block body is a syntax error.
        expect(result.code).not.toMatch(/}\.current\s*=/);
      });

      it('compiles to syntactically valid JavaScript for callback ref + innerHTML', () => {
        const source = `
          export function HighlightedCode({ html }) {
            return (
              <div
                className="foo"
                innerHTML={html}
                ref={(el) => { /* noop */ }}
              />
            );
          }
        `;
        const result = compile(source, { filename: 'app.tsx', target: 'dom' });
        expect(result.diagnostics).toEqual([]);
        // `new Function()` parses the string as a Program. If the compiler
        // emitted `(el) => {...}.current = __el0`, this throws a SyntaxError.
        // The actual imports don't need to resolve — we only exercise the parser.
        expect(() => new Function(result.code)).not.toThrow();
      });
    },
  );

  describe.skipIf(!hasNativeCompiler)('Given JSX with only a callback ref (no innerHTML)', () => {
    it('still routes through __ref() — the bug is not specific to innerHTML', () => {
      const source = `
        export function App() {
          return <div ref={(el) => { captured = el; }} />;
        }
      `;
      const result = compile(source, { filename: 'app.tsx', target: 'dom' });
      expect(result.diagnostics).toEqual([]);
      expect(result.code).toContain('__ref(');
      expect(result.code).not.toMatch(/}\.current\s*=/);
      expect(() => new Function(result.code)).not.toThrow();
    });
  });
});
