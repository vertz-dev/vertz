import { describe, expect, it } from 'bun:test';
import { compile } from '../../compiler';

describe('Conditional Transform', () => {
  describe('logical AND (&&)', () => {
    it('transforms reactive {show && <div>text</div>} to __conditional()', () => {
      const result = compile(
        `
function App() {
  let show = true;
  return <div>{show && <span>Content</span>}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__conditional(');
      // Condition should be a function returning the reactive value
      expect(result.code).toContain('() => show.value');
      // True branch should render the element
      expect(result.code).toContain('__element("span")');
      // False branch should return null (logical AND with no else)
      expect(result.code).toContain('() => null');
    });

    it('transforms non-literal static {flag && <div>text</div>} to __conditional()', () => {
      const result = compile(
        `
function App() {
  const flag = true;
  return <div>{flag && <span>Content</span>}</div>;
}
        `.trim(),
      );

      // Non-literal expressions always use __conditional for conditionals
      expect(result.code).toContain('__conditional(');
    });
  });

  describe('ternary (?:)', () => {
    it('transforms reactive {cond ? <A /> : <B />} to __conditional()', () => {
      const result = compile(
        `
function App() {
  let isLoggedIn = false;
  return <div>{isLoggedIn ? <Dashboard /> : <Login />}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__conditional(');
      // Condition function
      expect(result.code).toContain('() => isLoggedIn.value');
      // True branch renders Dashboard component
      expect(result.code).toContain('Dashboard(');
      // False branch renders Login component
      expect(result.code).toContain('Login(');
    });

    it('transforms ternary with native elements', () => {
      const result = compile(
        `
function App() {
  let active = true;
  return <div>{active ? <span>Yes</span> : <span>No</span>}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__conditional(');
      // Both branches should create elements
      const matches = result.code.match(/__element\("span"\)/g);
      expect(matches?.length).toBe(2);
    });

    it('transforms non-literal static ternary to __conditional()', () => {
      const result = compile(
        `
function App() {
  const mode = "dark";
  return <div>{mode === "dark" ? <span>Dark</span> : <span>Light</span>}</div>;
}
        `.trim(),
      );

      // Non-literal expressions always use __conditional for conditionals
      expect(result.code).toContain('__conditional(');
    });
  });

  describe('nested conditionals', () => {
    it('handles nested ternary inside ternary', () => {
      const result = compile(
        `
function App() {
  let status = "loading";
  return <div>{status === "loading" ? <Spinner /> : status === "error" ? <Error /> : <Content />}</div>;
}
        `.trim(),
      );

      // Should have at least one __conditional call
      expect(result.code).toContain('__conditional(');
      expect(result.code).toContain('Spinner(');
      expect(result.code).toContain('Error(');
      expect(result.code).toContain('Content(');
    });
  });

  describe('condition using signal .value', () => {
    it('transforms condition referencing computed value', () => {
      const result = compile(
        `
function App() {
  let count = 0;
  const isPositive = count > 0;
  return <div>{isPositive ? <span>Positive</span> : <span>Zero or less</span>}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__conditional(');
      // isPositive is a computed, so condition should use .value
      expect(result.code).toContain('isPositive.value');
    });
  });

  describe('import generation', () => {
    it('adds __conditional to internals import', () => {
      const result = compile(
        `
function App() {
  let show = true;
  return <div>{show && <span>Content</span>}</div>;
}
        `.trim(),
      );

      const internalsImport = result.code
        .split('\n')
        .find((line) => line.includes("from '@vertz/ui/internals'"));
      expect(internalsImport).toBeDefined();
      expect(internalsImport).toContain('__conditional');
    });
  });

  describe('nested parentheses', () => {
    it('handles nested parentheses (((expr))) in conditional expressions', () => {
      const result = compile(
        `
function App() {
  let active = true;
  return <div>{(((active))) ? <span>Yes</span> : <span>No</span>}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__conditional(');
      // Parentheses are preserved but reactivity works correctly
      expect(result.code).toContain('active.value');
      expect(result.code).toContain('__element("span")');
    });

    it('handles mixed parentheses and logical operators', () => {
      const result = compile(
        `
function App() {
  let show = true;
  return <div>{((show)) && <span>Content</span>}</div>;
}
        `.trim(),
      );

      expect(result.code).toContain('__conditional(');
      // Parentheses are preserved but reactivity works correctly
      expect(result.code).toContain('show.value');
      expect(result.code).toContain('() => null');
    });
  });
});
