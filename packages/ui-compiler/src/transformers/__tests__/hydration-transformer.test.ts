import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { HydrationTransformer } from '../hydration-transformer';

function transform(code: string): string {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const s = new MagicString(code);
  const transformer = new HydrationTransformer();
  transformer.transform(s, sf);
  return s.toString();
}

describe('HydrationTransformer', () => {
  // IT-5B-4: Compiler marks interactive components for hydration, skips static ones
  it('adds data-v-id to interactive component (has let)', () => {
    const code = `function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}`;
    const result = transform(code);
    expect(result).toContain('data-v-id="Counter"');
  });

  it('does not add data-v-id to static component (no let)', () => {
    const code = `function Title() {
  return <h1>Hello</h1>;
}`;
    const result = transform(code);
    expect(result).not.toContain('data-v-id');
  });

  it('handles self-closing JSX elements', () => {
    const code = `function Widget() {
  let active = false;
  return <input />;
}`;
    const result = transform(code);
    expect(result).toContain('data-v-id="Widget"');
  });

  it('handles arrow function components', () => {
    const code = `const Counter = () => {
  let count = 0;
  return <div>{count}</div>;
};`;
    const result = transform(code);
    expect(result).toContain('data-v-id="Counter"');
  });

  it('skips arrow function component without let', () => {
    const code = `const Header = () => {
  const title = "Hello";
  return <h1>{title}</h1>;
};`;
    const result = transform(code);
    expect(result).not.toContain('data-v-id');
  });

  it('handles multiple components in the same file', () => {
    const code = `function Counter() {
  let count = 0;
  return <button>{count}</button>;
}
function Title() {
  return <h1>Hello</h1>;
}`;
    const result = transform(code);
    expect(result).toContain('data-v-id="Counter"');
    expect(result).not.toContain('data-v-id="Title"');
  });

  it('generates different markers for different interactive components', () => {
    const code = `function Counter() {
  let count = 0;
  return <button>{count}</button>;
}
function Toggle() {
  let active = false;
  return <div>{active}</div>;
}`;
    const result = transform(code);
    expect(result).toContain('data-v-id="Counter"');
    expect(result).toContain('data-v-id="Toggle"');
  });
});
