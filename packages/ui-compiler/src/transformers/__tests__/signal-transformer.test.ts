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

const formVar: VariableInfo = {
  name: 'taskForm',
  kind: 'static',
  start: 0,
  end: 0,
  signalProperties: new Set(['submitting', 'dirty', 'valid']),
  plainProperties: new Set(['action', 'method', 'onSubmit', 'reset', 'setFieldError', 'submit']),
  fieldSignalProperties: new Set(['error', 'dirty', 'touched', 'value']),
};

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

  it('auto-unwraps 3-level field signal property chain', () => {
    const result = transform(
      `function TaskForm() {\n  const taskForm = form({ title: '' });\n  const err = taskForm.title.error;\n  return <div>{err}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.title.error.value');
  });

  it('does NOT unwrap middle accessor alone (field name is not a signal)', () => {
    const result = transform(
      `function TaskForm() {\n  const taskForm = form({ title: '' });\n  const field = taskForm.title;\n  return <div>{field}</div>;\n}`,
      [formVar],
    );
    expect(result).not.toContain('taskForm.title.value');
    expect(result).toContain('taskForm.title');
  });

  it('does NOT double-unwrap 3-level chain when .value already present', () => {
    const result = transform(
      `function TaskForm() {\n  const taskForm = form({ title: '' });\n  const err = taskForm.title.error.value;\n  return <div>{err}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.title.error.value');
    expect(result).not.toContain('taskForm.title.error.value.value');
  });

  it('still auto-unwraps 2-level signal properties alongside 3-level', () => {
    const result = transform(
      `function TaskForm() {\n  const taskForm = form({ title: '' });\n  const s = taskForm.submitting;\n  return <div>{s}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.submitting.value');
  });

  it('does NOT unwrap plain properties', () => {
    const result = transform(
      `function TaskForm() {\n  const taskForm = form({ title: '' });\n  const a = taskForm.action;\n  return <div>{a}</div>;\n}`,
      [formVar],
    );
    expect(result).not.toContain('taskForm.action.value');
    expect(result).toContain('taskForm.action');
  });

  it('auto-unwraps new form-level signal property dirty', () => {
    const result = transform(
      `function TaskForm() {\n  const taskForm = form({ title: '' });\n  const d = taskForm.dirty;\n  return <div>{d}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.dirty.value');
  });
});
