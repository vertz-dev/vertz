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
    ) => { code: string };
  };
}

function compileAndGetCode(source: string): string {
  const { compile } = loadCompiler();
  const result = compile(source, { filename: 'test.tsx' });
  return result.code;
}

describe('Feature: Props destructuring transform', () => {
  describe('Given a component with simple destructured props', () => {
    describe('When compiled', () => {
      it('Then rewrites parameter to __props and replaces references', () => {
        const code = compileAndGetCode(`
          function Card({ title }: { title: string }) {
            return <div>{title}</div>;
          }
        `);
        expect(code).toContain('__props');
        expect(code).toContain('__props.title');
      });

      it('Then rewrites multiple bindings', () => {
        const code = compileAndGetCode(`
          function Card({ title, subtitle }: { title: string; subtitle: string }) {
            return <div>{title} {subtitle}</div>;
          }
        `);
        expect(code).toContain('__props.title');
        expect(code).toContain('__props.subtitle');
      });
    });
  });

  describe('Given a component with type annotation on props', () => {
    describe('When compiled', () => {
      it('Then preserves the type annotation on __props', () => {
        const code = compileAndGetCode(`
          interface CardProps { title: string }
          function Card({ title }: CardProps) {
            return <div>{title}</div>;
          }
        `);
        expect(code).toContain('__props: CardProps');
      });
    });
  });

  describe('Given an arrow function component with destructured props', () => {
    describe('When compiled', () => {
      it('Then rewrites to __props access', () => {
        const code = compileAndGetCode(`
          const Card = ({ title }: { title: string }) => {
            return <div>{title}</div>;
          };
        `);
        expect(code).toContain('__props.title');
      });
    });
  });

  describe('Given an arrow expression body component', () => {
    describe('When compiled', () => {
      it('Then rewrites to __props access', () => {
        const code = compileAndGetCode(`
          const Card = ({ title }: { title: string }) => <div>{title}</div>;
        `);
        expect(code).toContain('__props.title');
      });
    });
  });

  describe('Given a component with a shadowed binding in inner scope', () => {
    describe('When compiled', () => {
      it('Then does NOT replace the shadowed reference', () => {
        const code = compileAndGetCode(`
          function Card({ title }: { title: string }) {
            const inner = () => {
              const title = 'override';
              return title;
            };
            return <div>{title}</div>;
          }
        `);
        // The outer reference should be transformed
        expect(code).toContain('__props.title');
        // The inner const declaration should remain
        expect(code).toContain("const title = 'override'");
        // The inner return should NOT be transformed
        expect(code).toContain('return title');
      });
    });
  });

  describe('Given a component with a component-level re-declaration of a prop name', () => {
    describe('When compiled', () => {
      it('Then does NOT replace references after the re-declaration', () => {
        const code = compileAndGetCode(`
          function Card({ title }: { title: string }) {
            const title = 'computed';
            return <div>{title}</div>;
          }
        `);
        // The const declaration should remain
        expect(code).toContain("const title = 'computed'");
        // The return reference should NOT be transformed (title is re-declared)
        expect(code).not.toContain('__props.title');
      });
    });
  });

  describe('Given a component with shorthand property using a prop', () => {
    describe('When compiled', () => {
      it('Then expands shorthand to key: __props.key', () => {
        const code = compileAndGetCode(`
          function Card({ title }: { title: string }) {
            const obj = { title };
            return <div>{obj}</div>;
          }
        `);
        expect(code).toContain('{ title: __props.title }');
      });
    });
  });

  describe('Given a component with aliased binding', () => {
    describe('When compiled', () => {
      it('Then uses original prop name for __props access', () => {
        const code = compileAndGetCode(`
          function Card({ id: cardId }: { id: string }) {
            return <div data-id={cardId}>content</div>;
          }
        `);
        expect(code).toContain('__props.id');
        expect(code).not.toContain('cardId');
      });
    });
  });

  describe('Given a component with default value', () => {
    describe('When compiled', () => {
      it('Then wraps in nullish coalescing', () => {
        const code = compileAndGetCode(`
          function Card({ size = 'md' }: { size?: string }) {
            return <div class={size}>content</div>;
          }
        `);
        expect(code).toContain("(__props.size ?? 'md')");
      });
    });
  });

  describe('Given a component with alias and default', () => {
    describe('When compiled', () => {
      it('Then uses original prop name with nullish coalescing', () => {
        const code = compileAndGetCode(`
          function Card({ size: s = 'md' }: { size?: string }) {
            return <div class={s}>content</div>;
          }
        `);
        expect(code).toContain("(__props.size ?? 'md')");
      });
    });
  });

  describe('Given a component with rest pattern', () => {
    describe('When compiled', () => {
      it('Then named props use __props, rest gets destructured at body top', () => {
        const code = compileAndGetCode(`
          function Card({ title, ...rest }: CardProps) {
            return <div class={rest.className}>{title}</div>;
          }
        `);
        expect(code).toContain('__props.title');
        expect(code).toContain('__props: CardProps');
        expect(code).toContain('const { title: __$drop_0, ...rest } = __props');
      });
    });
  });

  describe('Given a component with rest pattern and alias', () => {
    describe('When compiled', () => {
      it('Then alias uses original prop name, rest gets drop binding', () => {
        const code = compileAndGetCode(`
          function Card({ id: cardId, ...rest }: CardProps) {
            return <div data-id={cardId} class={rest.className}>content</div>;
          }
        `);
        expect(code).toContain('__props.id');
        expect(code).toContain('const { id: __$drop_0, ...rest } = __props');
      });
    });
  });

  describe('Given a non-component function with destructured params', () => {
    describe('When compiled', () => {
      it('Then does NOT transform to __props', () => {
        const code = compileAndGetCode(`
          function helper({ x }: { x: number }) {
            return x + 1;
          }
        `);
        expect(code).not.toContain('__props');
      });
    });
  });

  describe('Given a component without destructured props', () => {
    describe('When compiled', () => {
      it('Then does NOT transform to __props', () => {
        const code = compileAndGetCode(`
          function Card(props: { title: string }) {
            return <div>{props.title}</div>;
          }
        `);
        expect(code).not.toContain('__props');
        expect(code).toContain('props.title');
      });
    });
  });

  describe('Given a component with props used in template literal', () => {
    describe('When compiled', () => {
      it('Then replaces reference inside template', () => {
        const code = compileAndGetCode(
          'function Card({ title }: { title: string }) {\n' +
            '  return <div>{`Hello ${title}`}</div>;\n' +
            '}',
        );
        expect(code).toContain('__props.title');
      });
    });
  });

  describe('Given props alongside signal transforms', () => {
    describe('When compiled', () => {
      it('Then both transforms apply correctly', () => {
        const code = compileAndGetCode(`
          function Card({ title }: { title: string }) {
            let count = 0;
            return <div>{title} {count}</div>;
          }
        `);
        expect(code).toContain('__props.title');
        expect(code).toContain('count.value');
      });
    });
  });

  describe('Given an arrow expression body with destructured props', () => {
    describe('When compiled', () => {
      it('Then both props and mount frame transforms apply correctly', () => {
        const code = compileAndGetCode(`
          const Card = ({ title }: { title: string }) => <div>{title}</div>;
        `);
        expect(code).toContain('__props.title');
        expect(code).toContain('__pushMountFrame()');
        expect(code).toContain('__flushMountFrame()');
      });
    });
  });

  describe('Given a component with export default function and destructured props', () => {
    describe('When compiled', () => {
      it('Then rewrites to __props access', () => {
        const code = compileAndGetCode(`
          export default function Card({ title }: { title: string }) {
            return <div>{title}</div>;
          }
        `);
        expect(code).toContain('__props.title');
      });
    });
  });

  describe('Given a component with export const and destructured props', () => {
    describe('When compiled', () => {
      it('Then rewrites to __props access', () => {
        const code = compileAndGetCode(`
          export const Card = ({ title }: { title: string }) => {
            return <div>{title}</div>;
          };
        `);
        expect(code).toContain('__props.title');
      });
    });
  });
});
