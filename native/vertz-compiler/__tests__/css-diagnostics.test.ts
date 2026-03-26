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
      options?: { filename?: string; fastRefresh?: boolean; target?: string },
    ) => {
      code: string;
      css?: string;
      map?: string;
      diagnostics?: Array<{ message: string; line?: number; column?: number }>;
    };
  };
}

describe('Feature: CSS diagnostics', () => {
  describe('Given a component with valid css() shorthands', () => {
    describe('When compiled', () => {
      it('Then produces no CSS diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const styles = css({
    container: ['bg:primary', 'p:4', 'flex', 'rounded:md'],
  });
  return <div class={styles.container}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const cssDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('css-'),
        );
        expect(cssDiags.length).toBe(0);
      });
    });
  });

  describe('Given a css() call with unknown property', () => {
    describe('When compiled', () => {
      it('Then produces a css-unknown-property diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const styles = css({
    container: ['xyz:foo'],
  });
  return <div class={styles.container}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('css-unknown-property'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('xyz');
      });
    });
  });

  describe('Given a css() call with invalid spacing value', () => {
    describe('When compiled', () => {
      it('Then produces a css-invalid-spacing diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const styles = css({
    container: ['p:99'],
  });
  return <div class={styles.container}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('css-invalid-spacing'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('99');
      });
    });
  });

  describe('Given a css() call with unknown color token', () => {
    describe('When compiled', () => {
      it('Then produces a css-unknown-color-token diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const styles = css({
    container: ['bg:nonexistent'],
  });
  return <div class={styles.container}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('css-unknown-color-token'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('nonexistent');
      });
    });
  });

  describe('Given a css() call with malformed shorthand (too many colons)', () => {
    describe('When compiled', () => {
      it('Then produces a css-malformed-shorthand diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const styles = css({
    container: ['a:b:c:d'],
  });
  return <div class={styles.container}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('css-malformed-shorthand'),
        );
        expect(diag).toBeDefined();
      });
    });
  });

  describe('Given no css() calls in the file', () => {
    describe('When compiled', () => {
      it('Then produces no CSS diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const cssDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('css-'),
        );
        expect(cssDiags.length).toBe(0);
      });
    });
  });

  describe('Given a css() call with valid pseudo prefix', () => {
    describe('When compiled', () => {
      it('Then produces no diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const styles = css({
    btn: ['hover:bg:primary'],
  });
  return <div class={styles.btn}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        const cssDiags = (result.diagnostics ?? []).filter((d) =>
          d.message.includes('css-'),
        );
        expect(cssDiags.length).toBe(0);
      });
    });
  });

  describe('Given multiple invalid shorthands', () => {
    describe('When compiled', () => {
      it('Then produces multiple diagnostics', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const styles = css({
    container: ['xyz:foo', 'p:99'],
  });
  return <div class={styles.container}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const cssDiags = result.diagnostics!.filter((d) =>
          d.message.includes('css-'),
        );
        expect(cssDiags.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe('Given a css() call with unknown color namespace', () => {
    describe('When compiled', () => {
      it('Then produces a css-unknown-color-token diagnostic', () => {
        const { compile } = loadCompiler();
        const source = `function App() {
  const styles = css({
    container: ['bg:fakecolor.500'],
  });
  return <div class={styles.container}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.diagnostics).toBeDefined();
        const diag = result.diagnostics!.find((d) =>
          d.message.includes('css-unknown-color-token'),
        );
        expect(diag).toBeDefined();
        expect(diag!.message).toContain('fakecolor');
      });
    });
  });
});
