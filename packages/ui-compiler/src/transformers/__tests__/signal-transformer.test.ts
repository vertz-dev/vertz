import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { ComponentAnalyzer } from '../../analyzers/component-analyzer';
import type { VariableInfo } from '../../types';
import { SignalTransformer } from '../signal-transformer';

function transform(code: string, variables: VariableInfo[]) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, strict: true },
  });
  const sf = project.createSourceFile('test.tsx', code);
  const components = new ComponentAnalyzer().analyze(sf);
  const s = new MagicString(code);
  const transformer = new SignalTransformer();

  for (const comp of components) {
    transformer.transform(s, sf, comp, variables);
  }

  return s.toString();
}

describe('SignalTransformer', () => {
  it('transforms let declaration to signal()', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('const count = signal(0)');
  });

  it('transforms reads to .value', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('{count.value}');
  });

  it('transforms writes to .value', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  count = 5;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('count.value = 5');
  });

  it('transforms postfix increment to .value', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  count++;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('count.value++');
  });

  it('transforms compound assignment to .value', () => {
    const result = transform(
      `function Counter() {\n  let count = 0;\n  count += 1;\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('count.value += 1');
  });

  it('transforms both read and write in spread pattern', () => {
    const result = transform(
      `function App() {\n  let items = [];\n  items = [...items, "x"];\n  return <div>{items}</div>;\n}`,
      [{ name: 'items', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('items.value = [...items.value, "x"]');
  });

  it('does NOT transform property names in object literals', () => {
    const result = transform(
      `function App() {\n  let count = 0;\n  const obj = { count: 10 };\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    // Property name should stay as-is, value side should not be touched (it's a literal)
    expect(result).toContain('{ count: 10 }');
    expect(result).not.toContain('count.value: 10');
  });

  it('does NOT transform shorthand property names in object literals', () => {
    const result = transform(
      `function App() {\n  let count = 0;\n  const obj = { count };\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    // Shorthand property should not be transformed
    expect(result).not.toContain('count.value }');
  });

  describe('signal-object property unwrapping', () => {
    it('auto-unwraps signal properties from signal-objects', () => {
      const result = transform(
        `function TaskList() {\n  const tasks = query('/api/tasks');\n  return <div>{tasks.loading}</div>;\n}`,
        [{
          name: 'tasks',
          kind: 'signal-object',
          start: 0,
          end: 0,
          signalProperties: new Set(['data', 'loading', 'error']),
        }],
      );
      // Should insert .value after the signal property access
      expect(result).toContain('tasks.loading.value');
    });

    it('unwraps multiple signal properties', () => {
      const result = transform(
        `function TaskList() {\n  const tasks = query('/api/tasks');\n  const isLoading = tasks.loading;\n  const data = tasks.data;\n  const err = tasks.error;\n  return <div>{isLoading}</div>;\n}`,
        [{
          name: 'tasks',
          kind: 'signal-object',
          start: 0,
          end: 0,
          signalProperties: new Set(['data', 'loading', 'error']),
        }],
      );
      expect(result).toContain('tasks.loading.value');
      expect(result).toContain('tasks.data.value');
      expect(result).toContain('tasks.error.value');
    });

    it('does NOT unwrap non-signal properties', () => {
      const result = transform(
        `function TaskList() {\n  const tasks = query('/api/tasks');\n  tasks.refetch();\n  return <div>OK</div>;\n}`,
        [{
          name: 'tasks',
          kind: 'signal-object',
          start: 0,
          end: 0,
          signalProperties: new Set(['data', 'loading', 'error']),
        }],
      );
      // refetch is not a signal property, should not be unwrapped
      expect(result).toContain('tasks.refetch()');
      expect(result).not.toContain('tasks.refetch.value');
    });

    it('handles chained property access correctly', () => {
      const result = transform(
        `function UserForm() {\n  const form = form(schema);\n  const nameError = form.errors.name;\n  return <div>{nameError}</div>;\n}`,
        [{
          name: 'form',
          kind: 'signal-object',
          start: 0,
          end: 0,
          signalProperties: new Set(['errors', 'values', 'submitting']),
        }],
      );
      // Should unwrap .errors (it's a signal), then access .name on the unwrapped value
      expect(result).toContain('form.errors.value.name');
    });

    it('handles optional chaining on signal properties', () => {
      const result = transform(
        `function TaskList() {\n  const tasks = query('/api/tasks');\n  const data = tasks?.data;\n  return <div>{data}</div>;\n}`,
        [{
          name: 'tasks',
          kind: 'signal-object',
          start: 0,
          end: 0,
          signalProperties: new Set(['data', 'loading', 'error']),
        }],
      );
      expect(result).toContain('tasks?.data.value');
    });

    it('works alongside regular signal transforms', () => {
      const result = transform(
        `function TaskList() {\n  let statusFilter = 'all';\n  const tasks = query('/api/tasks');\n  return <div>{statusFilter} {tasks.loading}</div>;\n}`,
        [
          { name: 'statusFilter', kind: 'signal', start: 0, end: 0 },
          {
            name: 'tasks',
            kind: 'signal-object',
            start: 0,
            end: 0,
            signalProperties: new Set(['data', 'loading', 'error']),
          },
        ],
      );
      expect(result).toContain('const statusFilter = signal(');
      expect(result).toContain('statusFilter.value');
      expect(result).toContain('tasks.loading.value');
    });
  });
});
