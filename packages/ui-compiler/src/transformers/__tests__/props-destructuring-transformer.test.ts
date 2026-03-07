import { describe, expect, it } from 'bun:test';
import { compile } from '../../compiler';

describe('PropsDestructuringTransformer', () => {
  it('rewrites simple destructured prop to __props access', () => {
    const code = `
      function Card({ title }: { title: string }) {
        return <div>{title}</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain('__props');
    expect(result.code).toContain('__props.title');
    expect(result.code).not.toContain('{ title }');
  });

  it('rewrites multiple bindings', () => {
    const code = `
      function Card({ title, subtitle }: { title: string; subtitle: string }) {
        return <div>{title} {subtitle}</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain('__props.title');
    expect(result.code).toContain('__props.subtitle');
  });

  it('preserves type annotation', () => {
    const code = `
      interface CardProps { title: string }
      function Card({ title }: CardProps) {
        return <div>{title}</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain('__props: CardProps');
  });

  it('wraps prop access in __attr thunk for JSX attributes', () => {
    const code = `
      function Card({ completed }: { completed: boolean }) {
        return <div class={completed ? 'done' : 'pending'}>text</div>;
      }
    `;
    const result = compile(code);
    // __attr wraps non-literal expressions in a thunk
    expect(result.code).toContain('__attr');
    expect(result.code).toContain('__props.completed');
  });

  it('wraps prop access in __child thunk for JSX children', () => {
    const code = `
      function Card({ title }: { title: string }) {
        return <div>{title}</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain('__child(() => __props.title)');
  });

  it('works alongside signal transforms', () => {
    const code = `
      function Card({ title }: { title: string }) {
        let count = 0;
        return <div>{title} {count}</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain('__props.title');
    expect(result.code).toContain('count.value');
  });

  it('does not transform non-component functions', () => {
    const code = `
      function helper({ x }: { x: number }) {
        return x + 1;
      }
    `;
    const result = compile(code);
    // No JSX → not a component → no transform
    expect(result.code).not.toContain('__props');
  });

  it('does not transform components without destructured props', () => {
    const code = `
      function Card(props: { title: string }) {
        return <div>{props.title}</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).not.toContain('__props');
    expect(result.code).toContain('props.title');
  });

  it('transforms arrow function components', () => {
    const code = `
      const Card = ({ title }: { title: string }) => {
        return <div>{title}</div>;
      };
    `;
    const result = compile(code);
    expect(result.code).toContain('__props.title');
    expect(result.code).toContain('__props: { title: string }');
  });

  it('transforms arrow expression body components', () => {
    const code = `
      const Card = ({ title }: { title: string }) => <div>{title}</div>;
    `;
    const result = compile(code);
    expect(result.code).toContain('__props.title');
  });

  it('does not replace shadowed bindings in inner scope', () => {
    const code = `
      function Card({ title }: { title: string }) {
        const inner = () => {
          const title = 'override';
          return title;
        };
        return <div>{title}</div>;
      }
    `;
    const result = compile(code);
    // The JSX {title} should be __props.title
    expect(result.code).toContain('__props.title');
    // The inner const title = 'override' should remain
    expect(result.code).toContain("const title = 'override'");
    // The inner return title should NOT be __props.title
    expect(result.code).toContain('return title');
  });

  it('handles shorthand property assignment', () => {
    const code = `
      function Card({ title }: { title: string }) {
        const obj = { title };
        return <div>{obj.title}</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain('{ title: __props.title }');
  });

  it('does not emit props-destructuring diagnostic for transformed components', () => {
    const code = `
      function Card({ title }: { title: string }) {
        return <div>{title}</div>;
      }
    `;
    const result = compile(code);
    const propsDiags = result.diagnostics.filter((d) => d.code === 'props-destructuring');
    expect(propsDiags).toHaveLength(0);
  });

  it('still emits diagnostic for nested destructuring (unsupported)', () => {
    const code = `
      function Card({ style: { color } }: { style: { color: string } }) {
        return <div>{color}</div>;
      }
    `;
    const result = compile(code);
    const propsDiags = result.diagnostics.filter((d) => d.code === 'props-destructuring');
    expect(propsDiags).toHaveLength(1);
  });

  it('uses prop in template literal', () => {
    const code =
      `
      function Card({ title }: { title: string }) {
        return <div>{` +
      '`Hello ${title}`' +
      `}</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain('__props.title');
  });

  // Phase 2: Aliases and defaults
  it('rewrites aliased binding to original prop name', () => {
    const code = `
      function Card({ id: cardId }: { id: string }) {
        return <div data-id={cardId}>content</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain('__props.id');
    expect(result.code).not.toContain('cardId');
  });

  it('rewrites binding with default value using nullish coalescing', () => {
    const code = `
      function Card({ size = 'md' }: { size?: string }) {
        return <div class={size}>content</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain("__props.size ?? 'md'");
  });

  it('rewrites alias with default', () => {
    const code = `
      function Card({ size: s = 'md' }: { size?: string }) {
        return <div class={s}>content</div>;
      }
    `;
    const result = compile(code);
    expect(result.code).toContain("__props.size ?? 'md'");
    expect(result.code).not.toContain(' s ');
  });

  it('wraps default in parens in JSX attribute context', () => {
    const code = `
      function Card({ size = 'md' }: { size?: string }) {
        return <div class={size}>content</div>;
      }
    `;
    const result = compile(code);
    // Should be wrapped in parens for correct precedence in thunk
    expect(result.code).toContain("(__props.size ?? 'md')");
  });

  // Phase 3: Rest patterns
  it('handles rest pattern: named props use __props, rest gets destructured at body top', () => {
    const code = `
      function Card({ title, ...rest }: CardProps) {
        return <div class={rest.className}>{title}</div>;
      }
    `;
    const result = compile(code);
    // Named prop uses __props access
    expect(result.code).toContain('__props.title');
    // Rest gets real destructuring at body top
    expect(result.code).toContain('const { title: __$drop_0, ...rest } = __props');
    // Parameter rewritten
    expect(result.code).toContain('__props: CardProps');
  });

  it('handles rest pattern with alias', () => {
    const code = `
      function Card({ id: cardId, ...rest }: CardProps) {
        return <div data-id={cardId} class={rest.className}>content</div>;
      }
    `;
    const result = compile(code);
    // Alias uses original prop name via __props
    expect(result.code).toContain('__props.id');
    expect(result.code).not.toContain('cardId');
    // Rest gets destructuring with drop for 'id'
    expect(result.code).toContain('const { id: __$drop_0, ...rest } = __props');
  });
});
