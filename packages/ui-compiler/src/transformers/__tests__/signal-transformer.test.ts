import { describe, expect, it } from 'bun:test';
import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
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
    expect(result).toContain("const count = signal(0, 'count')");
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

  it('expands shorthand property to unwrap signal .value (#1858)', () => {
    const result = transform(
      `function App() {\n  let count = 0;\n  const obj = { count };\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    // Shorthand { count } → { count: count.value }
    expect(result).toContain('{ count: count.value }');
  });

  it('expands shorthand property among other properties (#1858)', () => {
    const result = transform(
      `function App() {\n  let count = 0;\n  const obj = { label: "x", count, other: 1 };\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    expect(result).toContain('count: count.value');
    // Regular property names should not be affected
    expect(result).toContain('label: "x"');
    expect(result).toContain('other: 1');
  });

  it('does NOT expand shorthand when signal name is shadowed by nested scope (#1858)', () => {
    const result = transform(
      `function App() {\n  let count = 0;\n  const result = items.map((count) => ({ count }));\n  return <div>{count}</div>;\n}`,
      [{ name: 'count', kind: 'signal', start: 0, end: 0 }],
    );
    // The `count` inside the arrow function's shorthand refers to the callback parameter,
    // not the signal. It should NOT be expanded to count.value.
    expect(result).not.toContain('count: count.value');
    expect(result).toContain('({ count })');
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

  it('dirty ambiguity: 2-level taskForm.dirty uses Pass 2, 3-level uses Pass 1', () => {
    // dirty is in BOTH signalProperties and fieldSignalProperties.
    // 2-level: taskForm.dirty → signalProperty via Pass 2 → .value
    // 3-level: taskForm.title.dirty → fieldSignalProperty via Pass 1 → .value
    const result = transform(
      `function TaskForm() {\n  const taskForm = form({ title: '' });\n  const d = taskForm.dirty;\n  const fd = taskForm.title.dirty;\n  return <div>{d}{fd}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.dirty.value');
    expect(result).toContain('taskForm.title.dirty.value');
    // Neither should be double-transformed
    expect(result).not.toContain('taskForm.dirty.value.value');
    expect(result).not.toContain('taskForm.title.dirty.value.value');
  });

  it('auto-unwraps 4-level chain (root.group.field.signal)', () => {
    const result = transform(
      `function UserForm() {\n  const taskForm = form({});\n  const err = taskForm.address.street.error;\n  return <div>{err}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.address.street.error.value');
  });

  it('auto-unwraps 5-level chain (root.a.b.c.signal)', () => {
    const result = transform(
      `function UserForm() {\n  const taskForm = form({});\n  const v = taskForm.deep.nested.field.value;\n  return <div>{v}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.deep.nested.field.value.value');
  });

  it('does NOT double-transform 4-level chain when .value already present', () => {
    const result = transform(
      `function UserForm() {\n  const taskForm = form({});\n  const err = taskForm.address.street.error.value;\n  return <div>{err}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.address.street.error.value');
    expect(result).not.toContain('taskForm.address.street.error.value.value');
  });

  it('does NOT transform when leaf is NOT a fieldSignalProperty', () => {
    const result = transform(
      `function UserForm() {\n  const taskForm = form({});\n  const x = taskForm.address.street.something;\n  return <div>{x}</div>;\n}`,
      [formVar],
    );
    expect(result).not.toContain('.something.value');
  });

  it('does NOT transform when intermediate is a signalProperty', () => {
    const result = transform(
      `function UserForm() {\n  const taskForm = form({});\n  const x = taskForm.submitting.error;\n  return <div>{x}</div>;\n}`,
      [formVar],
    );
    // submitting is a signalProperty, so this is NOT a field chain
    expect(result).not.toContain('taskForm.submitting.error.value');
  });

  it('transforms ElementAccessExpression: form[dynamicField].error', () => {
    const result = transform(
      `function DynForm() {\n  const taskForm = form({});\n  const field = 'title';\n  const err = taskForm[field].error;\n  return <div>{err}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm[field].error.value');
  });

  it('transforms mixed chain: form.items[0].name.error', () => {
    const result = transform(
      `function ArrayForm() {\n  const taskForm = form({});\n  const err = taskForm.items[0].name.error;\n  return <div>{err}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm.items[0].name.error.value');
  });

  it('transforms multiple bracket notations: form[a][b].error', () => {
    const result = transform(
      `function DynForm() {\n  const taskForm = form({});\n  const a = 'x';\n  const b = 'y';\n  const err = taskForm[a][b].error;\n  return <div>{err}</div>;\n}`,
      [formVar],
    );
    expect(result).toContain('taskForm[a][b].error.value');
  });
});
