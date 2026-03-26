import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: { filename?: string; hydrationMarkers?: boolean },
    ) => { code: string; hydrationIds?: string[] };
  };
}

function compileWithHydration(source: string) {
  const { compile } = loadCompiler();
  return compile(source, { filename: 'test.tsx', hydrationMarkers: true });
}

describe('Feature: Hydration markers (#1910)', () => {
  describe('Given an interactive component (has let declarations)', () => {
    describe('When compiled with hydrationMarkers: true', () => {
      it('Then injects data-v-id attribute on root element', () => {
        const result = compileWithHydration(`
          function Counter() {
            let count = 0;
            return <div>{count}</div>;
          }
        `);

        expect(result.code).toContain('.setAttribute("data-v-id", "Counter")');
      });

      it('Then reports the component name in hydrationIds', () => {
        const result = compileWithHydration(`
          function Counter() {
            let count = 0;
            return <div>{count}</div>;
          }
        `);

        expect(result.hydrationIds).toContain('Counter');
      });
    });
  });

  describe('Given a static component (no let declarations)', () => {
    describe('When compiled with hydrationMarkers: true', () => {
      it('Then does NOT inject data-v-id', () => {
        const result = compileWithHydration(`
          function Header() {
            const title = 'Hello';
            return <h1>{title}</h1>;
          }
        `);

        expect(result.code).not.toContain('data-v-id');
      });

      it('Then does NOT include component in hydrationIds', () => {
        const result = compileWithHydration(`
          function Header() {
            const title = 'Hello';
            return <h1>{title}</h1>;
          }
        `);

        expect(result.hydrationIds ?? []).not.toContain('Header');
      });
    });
  });

  describe('Given multiple components with mixed interactivity', () => {
    describe('When compiled with hydrationMarkers: true', () => {
      it('Then only marks interactive components', () => {
        const result = compileWithHydration(`
          function Counter() {
            let count = 0;
            return <div>{count}</div>;
          }

          function Label() {
            const text = 'Static';
            return <span>{text}</span>;
          }
        `);

        expect(result.code).toContain('.setAttribute("data-v-id", "Counter")');
        expect(result.code).not.toContain('"data-v-id", "Label"');
        expect(result.hydrationIds).toContain('Counter');
        expect(result.hydrationIds).not.toContain('Label');
      });
    });
  });

  describe('Given a self-closing root element', () => {
    describe('When compiled with hydrationMarkers: true', () => {
      it('Then injects data-v-id on self-closing element', () => {
        const result = compileWithHydration(`
          function Toggle() {
            let on = false;
            return <input checked={on} />;
          }
        `);

        expect(result.code).toContain('.setAttribute("data-v-id", "Toggle")');
      });
    });
  });

  describe('Given an arrow function component', () => {
    describe('When compiled with hydrationMarkers: true', () => {
      it('Then marks arrow function component with let as interactive', () => {
        const result = compileWithHydration(`
          const Counter = () => {
            let count = 0;
            return <button>{count}</button>;
          };
        `);

        expect(result.code).toContain('.setAttribute("data-v-id", "Counter")');
        expect(result.hydrationIds).toContain('Counter');
      });
    });
  });

  describe('Given hydrationMarkers is not set', () => {
    describe('When compiled without the option', () => {
      it('Then does NOT inject data-v-id', () => {
        const { compile } = loadCompiler();
        const result = compile(
          `function Counter() {
            let count = 0;
            return <div>{count}</div>;
          }`,
          { filename: 'test.tsx' },
        );

        expect(result.code).not.toContain('data-v-id');
      });
    });
  });
});
