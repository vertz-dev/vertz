import { describe, expect, it } from '@vertz/test';
import { NATIVE_MODULE_PATH } from './load-compiler';

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (source: string, options?: { filename?: string }) => { code: string };
  };
}

function compileAndGetCode(source: string): string {
  const { compile } = loadCompiler();
  const result = compile(source, { filename: 'test.tsx' });
  return result.code;
}

describe('Feature: Reactive early-return guards', () => {
  describe('Given a component with a signal-API guard followed by a main return', () => {
    describe('When compiled', () => {
      it('Then wraps the main return in __conditional with a thunk over the guard condition', () => {
        const code = compileAndGetCode(
          [
            "import { query } from '@vertz/ui';",
            'export function TestPage() {',
            '  const data = query(() => api.tasks.list(), { key: "task-list" });',
            '  if (data.loading) return <div>Loading...</div>;',
            '  return <div>Loaded</div>;',
            '}',
          ].join('\n'),
        );

        // The guard condition must be wrapped in a thunk (reactive)
        expect(code).toMatch(/__conditional\(\s*\(\)\s*=>\s*\(?data\.loading\.value\)?/);
        // The early-return if-statement must not remain as a plain `if` gate
        expect(code).not.toMatch(/if\s*\(data\.loading\.value\)\s*\{?\s*const __mfResult/);
      });

      it('Then flushes the mount frame exactly once for the guarded component', () => {
        const code = compileAndGetCode(
          [
            "import { query } from '@vertz/ui';",
            'export function TestPage() {',
            '  const data = query(() => api.tasks.list(), { key: "task-list" });',
            '  if (data.loading) return <div>Loading...</div>;',
            '  return <div>Loaded</div>;',
            '}',
          ].join('\n'),
        );

        const flushCount = (code.match(/__flushMountFrame\(\)/g) ?? []).length;
        expect(flushCount).toBe(1);
      });
    });
  });

  describe('Given a component with multiple consecutive guards', () => {
    describe('When compiled', () => {
      it('Then nests each guard in its own __conditional', () => {
        const code = compileAndGetCode(
          [
            "import { query } from '@vertz/ui';",
            'export function TestPage() {',
            '  const data = query(() => api.tasks.list(), { key: "task-list" });',
            '  if (data.loading) return <div>Loading</div>;',
            '  if (data.error) return <div>Error</div>;',
            '  return <div>Loaded</div>;',
            '}',
          ].join('\n'),
        );

        const condCount = (code.match(/__conditional\(/g) ?? []).length;
        // Two guards → two nested __conditional wrappers (plus any existing ones in JSX)
        expect(condCount).toBeGreaterThanOrEqual(2);
        expect(code).toContain('data.loading.value');
        expect(code).toContain('data.error.value');
      });
    });
  });

  describe('Given a component with a braced guard block', () => {
    describe('When compiled', () => {
      it('Then still wraps the main return in __conditional', () => {
        const code = compileAndGetCode(
          [
            "import { query } from '@vertz/ui';",
            'export function TestPage() {',
            '  const data = query(() => api.tasks.list(), { key: "task-list" });',
            '  if (data.loading) {',
            '    return <div>Loading</div>;',
            '  }',
            '  return <div>Loaded</div>;',
            '}',
          ].join('\n'),
        );

        expect(code).toMatch(/__conditional\(\s*\(\)\s*=>/);
        expect(code).toContain('data.loading.value');
      });
    });
  });

  describe('Given a component with a guard that uses a plain boolean prop', () => {
    describe('When compiled', () => {
      it('Then produces a reactive __conditional over the prop access', () => {
        const code = compileAndGetCode(
          [
            'export function Greet(props) {',
            '  if (props.loading) return <div>Loading</div>;',
            '  return <div>Ready</div>;',
            '}',
          ].join('\n'),
        );

        expect(code).toMatch(/__conditional\(\s*\(\)\s*=>\s*\(?props\.loading\)?/);
      });
    });
  });

  describe('Given a component with no early-return guard', () => {
    describe('When compiled', () => {
      it('Then does not introduce a __conditional around the single return', () => {
        const code = compileAndGetCode(
          ['export function Plain() {', '  return <div>hi</div>;', '}'].join('\n'),
        );

        // A plain component has no ternary / guard, so no __conditional wraps the body.
        // (It may still appear inside JSX for ternaries — but here there are none.)
        expect(code).not.toContain('__conditional(');
      });
    });
  });
});
