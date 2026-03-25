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
      options?: { filename?: string },
    ) => {
      code: string;
      components?: Array<{
        name: string;
        bodyStart: number;
        bodyEnd: number;
        variables?: Array<{
          name: string;
          kind: string;
          start: number;
          end: number;
          signalProperties?: string[];
          plainProperties?: string[];
        }>;
      }>;
    };
  };
}

describe('Feature: Component detection in native compiler', () => {
  describe('Given a file with a named function returning JSX', () => {
    describe('When analyzed', () => {
      it('Then detects the component with correct name and body range', () => {
        const { compile } = loadCompiler();
        const result = compile('function TaskCard() { return <div />; }', {
          filename: 'test.tsx',
        });
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(1);
        expect(result.components![0].name).toBe('TaskCard');
        expect(result.components![0].bodyStart).toBeGreaterThan(0);
        expect(result.components![0].bodyEnd).toBeGreaterThan(
          result.components![0].bodyStart,
        );
      });
    });
  });

  describe('Given a file with a const arrow function returning JSX', () => {
    describe('When analyzed', () => {
      it('Then detects the component', () => {
        const { compile } = loadCompiler();
        const result = compile('const TaskCard = () => <div />;', {
          filename: 'test.tsx',
        });
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(1);
        expect(result.components![0].name).toBe('TaskCard');
      });
    });
  });

  describe('Given a file with a const arrow function with block body returning JSX', () => {
    describe('When analyzed', () => {
      it('Then detects the component', () => {
        const { compile } = loadCompiler();
        const result = compile(
          'const TaskCard = () => { return <div />; };',
          { filename: 'test.tsx' },
        );
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(1);
        expect(result.components![0].name).toBe('TaskCard');
      });
    });
  });

  describe('Given a file with a const function expression returning JSX', () => {
    describe('When analyzed', () => {
      it('Then detects the component', () => {
        const { compile } = loadCompiler();
        const result = compile(
          'const Panel = function() { return <div />; };',
          { filename: 'test.tsx' },
        );
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(1);
        expect(result.components![0].name).toBe('Panel');
      });
    });
  });

  describe('Given a file with no JSX', () => {
    describe('When analyzed', () => {
      it('Then detects no components', () => {
        const { compile } = loadCompiler();
        const result = compile('function helper() { return 42; }', {
          filename: 'test.ts',
        });
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(0);
      });
    });
  });

  describe('Given a file with multiple components', () => {
    describe('When analyzed', () => {
      it('Then detects all components', () => {
        const { compile } = loadCompiler();
        const source = `
          function Header() { return <h1>Header</h1>; }
          const Footer = () => <footer>Footer</footer>;
        `;
        const result = compile(source, { filename: 'test.tsx' });
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(2);
        expect(result.components![0].name).toBe('Header');
        expect(result.components![1].name).toBe('Footer');
      });
    });
  });

  describe('Given a file with exported components', () => {
    describe('When analyzed', () => {
      it('Then detects the exported component', () => {
        const { compile } = loadCompiler();
        const source =
          'export function TaskCard() { return <div />; }';
        const result = compile(source, { filename: 'test.tsx' });
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(1);
        expect(result.components![0].name).toBe('TaskCard');
      });
    });
  });

  describe('Given a file with an exported const arrow function', () => {
    describe('When analyzed', () => {
      it('Then detects the exported const component', () => {
        const { compile } = loadCompiler();
        const source =
          'export const TaskCard = () => <div />;';
        const result = compile(source, { filename: 'test.tsx' });
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(1);
        expect(result.components![0].name).toBe('TaskCard');
      });
    });
  });

  describe('Given a file with export default function', () => {
    describe('When analyzed', () => {
      it('Then detects the default exported component', () => {
        const { compile } = loadCompiler();
        const source =
          'export default function App() { return <div />; }';
        const result = compile(source, { filename: 'test.tsx' });
        expect(result.components).toBeDefined();
        expect(result.components!.length).toBe(1);
        expect(result.components![0].name).toBe('App');
      });
    });
  });
});
