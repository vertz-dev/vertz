import { describe, expect, it } from 'vitest';
import { tui } from '../app';
import { Banner } from '../components/Banner';
import type { DiagnosticItem } from '../components/DiagnosticView';
import { DiagnosticView } from '../components/DiagnosticView';
import { Divider } from '../components/Divider';
import { KeyValue } from '../components/KeyValue';
import { TestAdapter } from '../test/test-adapter';
import { symbols } from '../theme';

describe('Divider', () => {
  it('renders a horizontal line of dash characters', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(() => Divider({}), { adapter });
    const text = adapter.text();
    expect(text).toContain(symbols.dash);
    handle.unmount();
  });

  it('renders labeled divider with centered label', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(() => Divider({ label: 'Section' }), { adapter });
    const text = adapter.text();
    expect(text).toContain('Section');
    expect(text).toContain(symbols.dash);
    handle.unmount();
  });

  it('respects custom char prop', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(() => Divider({ char: '=', width: 20 }), { adapter });
    const text = adapter.text();
    expect(text).toContain('='.repeat(20));
    expect(text).not.toContain(symbols.dash);
    handle.unmount();
  });

  it('respects custom width', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(() => Divider({ width: 40 }), { adapter });
    const text = adapter.text();
    expect(text).toContain(symbols.dash.repeat(40));
    handle.unmount();
  });
});

describe('KeyValue', () => {
  it('renders all key-value entries', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(
      () =>
        KeyValue({
          entries: [
            { key: 'Name', value: 'Alice' },
            { key: 'Age', value: '30' },
          ],
        }),
      { adapter },
    );
    const text = adapter.text();
    expect(text).toContain('Name');
    expect(text).toContain('Alice');
    expect(text).toContain('Age');
    expect(text).toContain('30');
    handle.unmount();
  });

  it('right-aligns keys so values line up', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(
      () =>
        KeyValue({
          entries: [
            { key: 'Name', value: 'Alice' },
            { key: 'Location', value: 'NYC' },
          ],
        }),
      { adapter },
    );
    const text = adapter.text();
    // "Name" (4 chars) should be padded to match "Location" (8 chars)
    expect(text).toContain('    Name');
    expect(text).toContain('Location');
    handle.unmount();
  });

  it('uses default separator', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(
      () =>
        KeyValue({
          entries: [{ key: 'Host', value: 'localhost' }],
        }),
      { adapter },
    );
    const text = adapter.text();
    expect(text).toContain(': ');
    handle.unmount();
  });
});

describe('Banner', () => {
  it('renders title text', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(() => Banner({ title: 'Welcome' }), { adapter });
    const text = adapter.text();
    expect(text).toContain('Welcome');
    handle.unmount();
  });

  it('renders subtitle when provided', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(() => Banner({ title: 'My App', subtitle: 'Version 1.0' }), {
      adapter,
    });
    const text = adapter.text();
    expect(text).toContain('My App');
    expect(text).toContain('Version 1.0');
    handle.unmount();
  });

  it('renders border characters', () => {
    const adapter = new TestAdapter(80, 10);

    const handle = tui.mount(() => Banner({ title: 'Boxed' }), { adapter });
    const text = adapter.text();
    // Round border uses ╭ and ╮
    expect(text).toContain('\u256D');
    expect(text).toContain('\u256E');
    handle.unmount();
  });
});

describe('DiagnosticView', () => {
  const errorDiag: DiagnosticItem = {
    severity: 'error',
    code: 'TS2345',
    message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
    file: 'src/index.ts',
    line: 10,
    column: 5,
    sourceLines: [
      { number: 9, text: 'function add(a: number, b: number) {' },
      { number: 10, text: '  return add("hello", 42);' },
    ],
    highlightStart: 13,
    highlightLength: 7,
    suggestion: 'Did you mean to pass a number?',
  };

  it('renders error code and severity icon', () => {
    const adapter = new TestAdapter(80, 20);

    const handle = tui.mount(() => DiagnosticView({ diagnostics: [errorDiag] }), { adapter });
    const text = adapter.text();
    expect(text).toContain(symbols.error);
    expect(text).toContain('TS2345');
    handle.unmount();
  });

  it('renders diagnostic message', () => {
    const adapter = new TestAdapter(80, 20);

    const handle = tui.mount(() => DiagnosticView({ diagnostics: [errorDiag] }), { adapter });
    const text = adapter.text();
    expect(text).toContain('Argument of type');
    handle.unmount();
  });

  it('renders file location', () => {
    const adapter = new TestAdapter(80, 20);

    const handle = tui.mount(() => DiagnosticView({ diagnostics: [errorDiag] }), { adapter });
    const text = adapter.text();
    expect(text).toContain('at src/index.ts:10:5');
    handle.unmount();
  });

  it('renders source context with line numbers', () => {
    const adapter = new TestAdapter(80, 20);

    const handle = tui.mount(() => DiagnosticView({ diagnostics: [errorDiag] }), { adapter });
    const text = adapter.text();
    expect(text).toContain('function add(a: number, b: number) {');
    expect(text).toContain('return add("hello", 42);');
    expect(text).toContain(' 9');
    expect(text).toContain('10');
    handle.unmount();
  });

  it('renders highlight underline', () => {
    const adapter = new TestAdapter(80, 20);

    const handle = tui.mount(() => DiagnosticView({ diagnostics: [errorDiag] }), { adapter });
    const text = adapter.text();
    expect(text).toContain('^^^^^^^');
    handle.unmount();
  });

  it('renders suggestion', () => {
    const adapter = new TestAdapter(80, 20);

    const handle = tui.mount(() => DiagnosticView({ diagnostics: [errorDiag] }), { adapter });
    const text = adapter.text();
    expect(text).toContain(symbols.info);
    expect(text).toContain('Did you mean to pass a number?');
    handle.unmount();
  });

  it('showSource: false hides source context', () => {
    const adapter = new TestAdapter(80, 20);

    const handle = tui.mount(
      () => DiagnosticView({ diagnostics: [errorDiag], showSource: false }),
      { adapter },
    );
    const text = adapter.text();
    expect(text).toContain('TS2345');
    expect(text).not.toContain('function add');
    expect(text).not.toContain('^^^^^^^');
    handle.unmount();
  });

  it('renders multiple diagnostics', () => {
    const adapter = new TestAdapter(80, 30);

    const warningDiag: DiagnosticItem = {
      severity: 'warning',
      code: 'TS6133',
      message: "'x' is declared but its value is never read.",
    };

    const handle = tui.mount(() => DiagnosticView({ diagnostics: [errorDiag, warningDiag] }), {
      adapter,
    });
    const text = adapter.text();
    expect(text).toContain('TS2345');
    expect(text).toContain('TS6133');
    expect(text).toContain(symbols.error);
    expect(text).toContain(symbols.warning);
    handle.unmount();
  });
});
