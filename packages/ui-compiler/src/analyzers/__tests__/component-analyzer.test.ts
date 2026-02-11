import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../component-analyzer';

function analyze(code: string) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  return new ComponentAnalyzer().analyze(sf);
}

describe('ComponentAnalyzer', () => {
  it('detects named function returning JSX', () => {
    const result = analyze(`
      function Counter() {
        return <div>hello</div>;
      }
    `);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Counter');
  });

  it('detects arrow function returning JSX', () => {
    const result = analyze(`
      const Card = () => <div>card</div>;
    `);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Card');
  });

  it('detects arrow function with block body returning JSX', () => {
    const result = analyze(`
      const Card = () => {
        return <div>card</div>;
      };
    `);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Card');
  });

  it('skips non-component functions', () => {
    const result = analyze(`
      function helper() {
        return 42;
      }
      const util = () => "hello";
    `);
    expect(result).toHaveLength(0);
  });

  it('captures props parameter name', () => {
    const result = analyze(`
      function Greeting(props) {
        return <div>{props.name}</div>;
      }
    `);
    expect(result[0]?.propsParam).toBe('props');
    expect(result[0]?.hasDestructuredProps).toBe(false);
  });

  it('flags destructured props', () => {
    const result = analyze(`
      function Greeting({ name, age }) {
        return <div>{name}</div>;
      }
    `);
    expect(result[0]?.propsParam).toBeNull();
    expect(result[0]?.hasDestructuredProps).toBe(true);
  });

  it('handles function with no parameters', () => {
    const result = analyze(`
      function App() {
        return <div>app</div>;
      }
    `);
    expect(result[0]?.propsParam).toBeNull();
    expect(result[0]?.hasDestructuredProps).toBe(false);
  });

  it('detects multiple components in one file', () => {
    const result = analyze(`
      function Header() {
        return <header>header</header>;
      }
      const Footer = () => <footer>footer</footer>;
    `);
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('Header');
    expect(result[1]?.name).toBe('Footer');
  });

  it('detects function expression assigned to const', () => {
    const result = analyze(`
      const Panel = function() {
        return <div>panel</div>;
      };
    `);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Panel');
  });

  it('detects arrow with parenthesized JSX return', () => {
    const result = analyze(`
      const List = () => (
        <ul>
          <li>item</li>
        </ul>
      );
    `);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('List');
  });
});
