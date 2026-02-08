import { type Diagnostic, Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { transform } from './compiler';

/**
 * Validates TypeScript type preservation across the compiler transform.
 *
 * Key question: Does `tsc --noEmit` work on source files where
 * `let count = 0` gets compiled to `signal(0)`?
 *
 * Approach:
 * 1. Type-check the SOURCE file (pre-transform) with tsc
 * 2. Type-check the OUTPUT file (post-transform) with tsc
 * 3. Both should pass without errors
 */

function typeCheck(code: string, filename = 'input.tsx'): Diagnostic[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: 4, // JsxPreserve
      target: 99,
      module: 99,
      strict: true,
      noEmit: true,
      // Do NOT enable noUnusedLocals/noUnusedParameters for this test
      // since transformed code may have different usage patterns
    },
  });

  project.createSourceFile(filename, code);
  return project.getPreEmitDiagnostics();
}

function typeCheckWithSignalRuntime(code: string): Diagnostic[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: 4,
      target: 99,
      module: 99,
      strict: true,
      noEmit: true,
    },
  });

  // Provide type declarations for the runtime
  project.createSourceFile(
    'node_modules/@vertz/ui/runtime.d.ts',
    `
    export interface Signal<T> {
      get(): T;
      set(value: T): void;
      update(fn: (prev: T) => T): void;
    }
    export interface ReadonlySignal<T> {
      get(): T;
    }
    export function signal<T>(value: T): Signal<T>;
    export function computed<T>(fn: () => T): ReadonlySignal<T>;
  `,
  );

  project.createSourceFile('input.tsx', code);
  const diagnostics = project.getPreEmitDiagnostics();
  // Filter out "Cannot find module" errors for JSX runtime since we don't provide it
  return diagnostics.filter((d) => !d.getMessageText().toString().includes('Cannot find module'));
}

describe('type-check validation', () => {
  describe('source code (pre-transform) type checking', () => {
    it('plain Counter component type-checks successfully', () => {
      const source = `
function Counter() {
  let count = 0;
  return <div><p>Count: {count}</p><button onClick={() => count++}>+</button></div>;
}`;
      const diags = typeCheck(source);
      const errors = diags.filter((d) => d.getCategory() === 0); // 0 = Error
      if (errors.length > 0) {
        console.log(
          'Source type errors:',
          errors.map((d) => d.getMessageText().toString()),
        );
      }
      expect(errors.length).toBe(0);
    });

    it('PriceDisplay with derived const type-checks', () => {
      const source = `
function PriceDisplay(props: { price: number }) {
  let quantity = 1;
  const total = props.price * quantity;
  const formatted = "$" + total.toFixed(2);
  return <p>Total: {formatted}</p>;
}`;
      const diags = typeCheck(source);
      const errors = diags.filter((d) => d.getCategory() === 0);
      if (errors.length > 0) {
        console.log(
          'Source type errors:',
          errors.map((d) => d.getMessageText().toString()),
        );
      }
      expect(errors.length).toBe(0);
    });

    it('component with typed array state type-checks', () => {
      const source = `
interface Todo { id: string; title: string; done: boolean; }

function TodoList() {
  let todos: Todo[] = [];
  const addTodo = (title: string) => {
    todos = [...todos, { id: crypto.randomUUID(), title, done: false }];
  };
  return (
    <ul>
      {todos.map((t) => <li key={t.id}>{t.title}</li>)}
    </ul>
  );
}`;
      const diags = typeCheck(source);
      const errors = diags.filter((d) => d.getCategory() === 0);
      if (errors.length > 0) {
        console.log(
          'Source type errors:',
          errors.map((d) => d.getMessageText().toString()),
        );
      }
      expect(errors.length).toBe(0);
    });
  });

  describe('compiled output (post-transform) type checking', () => {
    it('transformed Counter output type-checks against signal runtime', () => {
      const source = `
function Counter() {
  let count = 0;
  return <div>{count}</div>;
}`;
      const result = transform(source);
      const diags = typeCheckWithSignalRuntime(result.code);
      const errors = diags.filter((d) => d.getCategory() === 0);
      if (errors.length > 0) {
        console.log('Compiled output:', result.code);
        console.log(
          'Type errors:',
          errors.map((d) => d.getMessageText().toString()),
        );
      }
      expect(errors.length).toBe(0);
    });

    it('transformed counter with ++ operator type-checks', () => {
      const source = `
function Counter() {
  let count = 0;
  return <button onClick={() => count++}>{count}</button>;
}`;
      const result = transform(source);
      const diags = typeCheckWithSignalRuntime(result.code);
      const errors = diags.filter((d) => d.getCategory() === 0);
      if (errors.length > 0) {
        console.log('Compiled output:', result.code);
        console.log(
          'Type errors:',
          errors.map((d) => d.getMessageText().toString()),
        );
      }
      expect(errors.length).toBe(0);
    });

    it('transformed assignment operator type-checks', () => {
      const source = `
function Toggle() {
  let active = false;
  return <button onClick={() => active = !active}>{active}</button>;
}`;
      const result = transform(source);
      const diags = typeCheckWithSignalRuntime(result.code);
      const errors = diags.filter((d) => d.getCategory() === 0);
      if (errors.length > 0) {
        console.log('Compiled output:', result.code);
        console.log(
          'Type errors:',
          errors.map((d) => d.getMessageText().toString()),
        );
      }
      expect(errors.length).toBe(0);
    });
  });

  describe('type preservation across transform', () => {
    it('number types are preserved through signal wrapping', () => {
      const source = `
function Counter() {
  let count = 0;
  return <div>{count + 1}</div>;
}`;
      // Source should type-check (count is number, count + 1 is number)
      expect(typeCheck(source).filter((d) => d.getCategory() === 0).length).toBe(0);

      // Compiled should type-check (__count.get() returns number)
      const result = transform(source);
      expect(
        typeCheckWithSignalRuntime(result.code).filter((d) => d.getCategory() === 0).length,
      ).toBe(0);
    });

    it('string types are preserved through signal wrapping', () => {
      const source = `
function Greeting() {
  let name = "world";
  return <h1>Hello, {name}!</h1>;
}`;
      expect(typeCheck(source).filter((d) => d.getCategory() === 0).length).toBe(0);

      const result = transform(source);
      expect(
        typeCheckWithSignalRuntime(result.code).filter((d) => d.getCategory() === 0).length,
      ).toBe(0);
    });

    it('boolean types are preserved through signal wrapping', () => {
      const source = `
function Toggle() {
  let active = false;
  return <div>{active ? "yes" : "no"}</div>;
}`;
      expect(typeCheck(source).filter((d) => d.getCategory() === 0).length).toBe(0);

      const result = transform(source);
      expect(
        typeCheckWithSignalRuntime(result.code).filter((d) => d.getCategory() === 0).length,
      ).toBe(0);
    });
  });
});
