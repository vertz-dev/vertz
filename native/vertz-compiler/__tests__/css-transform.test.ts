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
      options?: { filename?: string; fastRefresh?: boolean },
    ) => {
      code: string;
      css?: string;
      map?: string;
      diagnostics?: Array<{ message: string; line?: number; column?: number }>;
    };
  };
}

describe('Feature: CSS extraction transform', () => {
  describe('Given a static css() call with token strings', () => {
    describe('When compiled', () => {
      it('Then replaces css() with class name map', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const styles = css({ panel: ['bg:background', 'p:4'] });
  return <div class={styles.panel}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.code).not.toContain('css({');
        // Should contain the class name object
        expect(result.code).toContain('panel:');
        expect(result.code).toContain("'_");
      });

      it('Then produces extracted CSS string', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const styles = css({ panel: ['bg:background', 'p:4'] });
  return <div class={styles.panel}>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toBeDefined();
        expect(result.css).toContain('background-color');
        expect(result.css).toContain('padding');
      });
    });
  });

  describe('Given css() with spacing tokens', () => {
    describe('When compiled', () => {
      it('Then resolves spacing values to rem', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ box: ['p:2', 'm:4', 'gap:6'] });
  return <div class={s.box} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('padding: 0.5rem');
        expect(result.css).toContain('margin: 1rem');
        expect(result.css).toContain('gap: 1.5rem');
      });
    });
  });

  describe('Given css() with color tokens', () => {
    describe('When compiled', () => {
      it('Then resolves color namespaces to CSS custom properties', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ el: ['bg:primary', 'text:foreground'] });
  return <div class={s.el} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('var(--color-primary)');
        expect(result.css).toContain('var(--color-foreground)');
      });

      it('Then resolves color shades', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ el: ['bg:primary.700'] });
  return <div class={s.el} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('var(--color-primary-700)');
      });

      it('Then resolves color with opacity modifier', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ el: ['bg:primary/50'] });
  return <div class={s.el} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('color-mix(in oklch, var(--color-primary) 50%, transparent)');
      });

      it('Then passes through CSS color keywords', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ el: ['bg:transparent', 'text:inherit'] });
  return <div class={s.el} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('background-color: transparent');
        expect(result.css).toContain('color: inherit');
      });
    });
  });

  describe('Given css() with pseudo-class prefixes', () => {
    describe('When compiled', () => {
      it('Then generates pseudo-class CSS rules', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ btn: ['bg:primary', 'hover:bg:primary.700'] });
  return <button class={s.btn} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain(':hover');
        expect(result.css).toContain('var(--color-primary-700)');
      });
    });
  });

  describe('Given css() with keyword tokens', () => {
    describe('When compiled', () => {
      it('Then resolves display keywords', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ container: ['flex', 'flex-col', 'relative'] });
  return <div class={s.container} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('display: flex');
        expect(result.css).toContain('flex-direction: column');
        expect(result.css).toContain('position: relative');
      });
    });
  });

  describe('Given css() with radius tokens', () => {
    describe('When compiled', () => {
      it('Then resolves radius to var-based calc', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ card: ['rounded:lg'] });
  return <div class={s.card} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('border-radius');
        expect(result.css).toContain('var(--radius)');
      });
    });
  });

  describe('Given css() with multiple blocks', () => {
    describe('When compiled', () => {
      it('Then generates class names for each block', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({
    panel: ['p:4', 'bg:background'],
    title: ['font:lg', 'weight:semibold'],
  });
  return <div class={s.panel}><h1 class={s.title}>Title</h1></div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        // Both blocks should have class names
        expect(result.code).toContain('panel:');
        expect(result.code).toContain('title:');
        // CSS should contain both blocks' rules
        expect(result.css).toContain('padding');
        expect(result.css).toContain('font-size');
        expect(result.css).toContain('font-weight: 600');
      });
    });
  });

  describe('Given a reactive css() call (dynamic expression)', () => {
    describe('When compiled', () => {
      it('Then leaves the call untouched', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const theme = getTheme();
  const s = css({ panel: [theme.bg] });
  return <div class={s.panel} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        // Reactive call stays as-is
        expect(result.code).toContain('css(');
      });
    });
  });

  describe('Given deterministic class name generation', () => {
    describe('When compiled twice with same input', () => {
      it('Then produces identical class names', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ panel: ['p:4'] });
  return <div class={s.panel} />;
}`;
        const result1 = compile(source, { filename: 'src/App.tsx' });
        const result2 = compile(source, { filename: 'src/App.tsx' });
        expect(result1.code).toBe(result2.code);
        expect(result1.css).toBe(result2.css);
      });
    });
  });

  describe('Given css() with size tokens', () => {
    describe('When compiled', () => {
      it('Then resolves size keywords', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ el: ['w:full', 'h:screen'] });
  return <div class={s.el} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('width: 100%');
        expect(result.css).toContain('height: 100vh');
      });
    });
  });

  describe('Given css() with alignment tokens', () => {
    describe('When compiled', () => {
      it('Then resolves alignment values', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ el: ['items:center', 'justify:between'] });
  return <div class={s.el} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('align-items: center');
        expect(result.css).toContain('justify-content: space-between');
      });
    });
  });

  describe('Given css() with raw value type properties', () => {
    describe('When compiled', () => {
      it('Then passes through the value as-is', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({ el: ['cursor:pointer', 'z:10', 'opacity:0.5'] });
  return <div class={s.el} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('cursor: pointer');
        expect(result.css).toContain('z-index: 10');
        expect(result.css).toContain('opacity: 0.5');
      });
    });
  });

  describe('Given a file with no css() calls', () => {
    describe('When compiled', () => {
      it('Then returns no extracted CSS', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  return <div>Hello</div>;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toBeUndefined();
      });
    });
  });

  describe('Given css() with nested selector objects', () => {
    describe('When compiled', () => {
      it('Then generates nested CSS rules', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({
    input: [
      'p:2',
      { '&:focus': ['ring:1'] },
    ],
  });
  return <input class={s.input} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('padding');
        expect(result.css).toContain(':focus');
        expect(result.css).toContain('outline');
      });
    });
  });

  describe('Given css() with @media at-rules', () => {
    describe('When compiled', () => {
      it('Then generates at-rule wrapping', () => {
        const { compile } = loadCompiler();
        const source = `
function App() {
  const s = css({
    container: [
      'p:4',
      { '@media (min-width: 768px)': ['p:8'] },
    ],
  });
  return <div class={s.container} />;
}`;
        const result = compile(source, { filename: 'src/App.tsx' });
        expect(result.css).toContain('@media (min-width: 768px)');
        expect(result.css).toContain('padding: 2rem');
      });
    });
  });
});
