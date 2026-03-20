import { describe, expect, it } from 'bun:test';
import { compile } from '../compiler';

describe('Feature: JSX spread attributes', () => {
  describe('Component call spread attributes', () => {
    describe('Given a component with spread-only props', () => {
      describe('When compiled', () => {
        it('Then generates Component({ ...expr })', () => {
          const result = compile(
            `
function Parent() {
  const props = { intent: 'primary' };
  return <Button {...props} />;
}
          `.trim(),
          );

          expect(result.code).toContain('Button({ ...props })');
        });
      });
    });

    describe('Given a component with spread before explicit props', () => {
      describe('When compiled', () => {
        it('Then generates Component({ ...expr, key: value })', () => {
          const result = compile(
            `
function Parent() {
  const base = { size: 'md' };
  return <Button {...base} intent="primary" />;
}
          `.trim(),
          );

          expect(result.code).toContain('...base');
          expect(result.code).toContain('intent: "primary"');
          // Spread should come before explicit prop
          const code = result.code;
          const spreadIdx = code.indexOf('...base');
          const intentIdx = code.indexOf('intent: "primary"');
          expect(spreadIdx).toBeLessThan(intentIdx);
        });
      });
    });

    describe('Given a component with spread after explicit props', () => {
      describe('When compiled', () => {
        it('Then generates Component({ key: value, ...expr })', () => {
          const result = compile(
            `
function Parent() {
  const overrides = { intent: 'danger' };
  return <Button intent="ghost" {...overrides} />;
}
          `.trim(),
          );

          const code = result.code;
          expect(code).toContain('intent: "ghost"');
          expect(code).toContain('...overrides');
          // Explicit prop should come before spread
          const intentIdx = code.indexOf('intent: "ghost"');
          const spreadIdx = code.indexOf('...overrides');
          expect(intentIdx).toBeLessThan(spreadIdx);
        });
      });
    });

    describe('Given a component with reactive props and spread', () => {
      describe('When compiled', () => {
        it('Then spread and getter props coexist in object literal', () => {
          const result = compile(
            `
function Parent() {
  let count = 0;
  const base = { size: 'md' };
  return <Counter {...base} value={count} />;
}
          `.trim(),
          );

          const code = result.code;
          expect(code).toContain('...base');
          // Reactive prop should use getter syntax
          expect(code).toContain('get value()');
        });
      });
    });

    describe('Given a component with multiple spreads', () => {
      describe('When compiled', () => {
        it('Then all spreads are emitted in source order', () => {
          const result = compile(
            `
function Parent() {
  const a = { x: 1 };
  const b = { y: 2 };
  return <Widget {...a} middle="val" {...b} />;
}
          `.trim(),
          );

          const code = result.code;
          expect(code).toContain('...a');
          expect(code).toContain('...b');
          const aIdx = code.indexOf('...a');
          const midIdx = code.indexOf('middle: "val"');
          const bIdx = code.indexOf('...b');
          expect(aIdx).toBeLessThan(midIdx);
          expect(midIdx).toBeLessThan(bIdx);
        });
      });
    });

    describe('Given a component with children and spread', () => {
      describe('When compiled', () => {
        it('Then spread is included in props alongside children thunk', () => {
          const result = compile(
            `
function Parent() {
  const props = { intent: 'primary' };
  return <Button {...props}>Click</Button>;
}
          `.trim(),
          );

          const code = result.code;
          expect(code).toContain('...props');
          expect(code).toContain('Button(');
        });
      });
    });
  });

  describe('Intrinsic element spread attributes (compiler output)', () => {
    describe('Given a self-closing intrinsic element with spread', () => {
      describe('When compiled', () => {
        it('Then emits __spread(elVar, expr)', () => {
          const result = compile(
            `
function App() {
  const rest = { 'data-testid': 'btn' };
  return <input {...rest} />;
}
          `.trim(),
          );

          expect(result.code).toContain('__spread(');
          expect(result.code).toContain(', rest)');
        });
      });
    });

    describe('Given an intrinsic element with explicit attrs and spread', () => {
      describe('When compiled', () => {
        it('Then source order is preserved in emitted statements', () => {
          const result = compile(
            `
function App() {
  const rest = { 'aria-label': 'Close' };
  return <button className="base" {...rest} disabled>X</button>;
}
          `.trim(),
          );

          const code = result.code;
          // className="base" → setAttribute before spread
          expect(code).toContain('setAttribute("class", "base")');
          expect(code).toContain('__spread(');
          expect(code).toContain('setAttribute("disabled"');

          const classIdx = code.indexOf('setAttribute("class", "base")');
          const spreadIdx = code.indexOf('__spread(');
          const disabledIdx = code.indexOf('setAttribute("disabled"');
          expect(classIdx).toBeLessThan(spreadIdx);
          expect(spreadIdx).toBeLessThan(disabledIdx);
        });
      });
    });

    describe('Given an intrinsic element with event handler and spread', () => {
      describe('When compiled', () => {
        it('Then __on and __spread are both emitted in source order', () => {
          const result = compile(
            `
function App() {
  const rest = { 'data-x': '1' };
  return <button onClick={() => {}} {...rest}>X</button>;
}
          `.trim(),
          );

          const code = result.code;
          expect(code).toContain('__on(');
          expect(code).toContain('__spread(');
          const onIdx = code.indexOf('__on(');
          const spreadIdx = code.indexOf('__spread(');
          expect(onIdx).toBeLessThan(spreadIdx);
        });
      });
    });

    describe('Given an intrinsic element with spread importing __spread', () => {
      describe('When compiled', () => {
        it('Then __spread is auto-imported from @vertz/ui/internals', () => {
          const result = compile(
            `
function App() {
  const rest = {};
  return <div {...rest} />;
}
          `.trim(),
          );

          expect(result.code).toContain("from '@vertz/ui/internals'");
          expect(result.code).toContain('__spread');
        });
      });
    });

    describe('Given a signal variable also used in a spread (MagicString correctness)', () => {
      describe('When compiled', () => {
        it('Then source.slice picks up .value transforms applied by signal transformer', () => {
          // This test verifies that the compiler reads spread expressions from
          // MagicString (source.slice) rather than the original AST (getText).
          // When a let variable is transformed to a signal AND used in a spread,
          // the spread must emit the transformed name (with .value).
          const result = compile(
            `
function App() {
  let count = 0;
  return <div data-count={count} {...{ extra: count }} />;
}
          `.trim(),
          );

          const code = result.code;
          // count is transformed to a signal because it's used in a JSX attribute
          expect(code).toContain('signal(0');
          // The spread expression reads from MagicString which has .value
          expect(code).toContain('__spread(');
          // The inline spread object { extra: count } should have count.value
          expect(code).toContain('count.value');
        });
      });
    });
  });
});
