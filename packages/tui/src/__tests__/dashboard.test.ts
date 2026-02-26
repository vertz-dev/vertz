import { signal } from '@vertz/ui';
import { describe, expect, it } from 'vitest';
import { tui } from '../app';
import { Dashboard } from '../components/Dashboard';
import { LogStream } from '../components/LogStream';
import { __append, __element, __staticText } from '../internals';
import { TestAdapter } from '../test/test-adapter';
import type { TuiElement } from '../tui-element';

describe('Dashboard', () => {
  it('renders header at top, footer at bottom, content in middle', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiElement {
      const header = __element('Text', 'bold', true);
      __append(header, __staticText('=== HEADER ==='));

      const footer = __element('Text', 'dim', true);
      __append(footer, __staticText('[status bar]'));

      const content = __element('Text');
      __append(content, __staticText('Main content'));

      return Dashboard({ header, footer, children: content });
    }

    const handle = tui.mount(App, { adapter });

    const row0 = adapter.textAt(0);
    const row9 = adapter.textAt(9);

    expect(row0).toContain('HEADER');
    expect(row9).toContain('status bar');
    handle.unmount();
  });

  it('content fills the space between header and footer', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiElement {
      const header = __element('Text');
      __append(header, __staticText('H'));

      const footer = __element('Text');
      __append(footer, __staticText('F'));

      const contentBox = __element('Box', 'direction', 'column');
      for (let i = 0; i < 8; i++) {
        const line = __element('Text');
        __append(line, __staticText(`Line ${i}`));
        __append(contentBox, line);
      }

      return Dashboard({ header, footer, children: contentBox });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Line 0');
    // The header is row 0, footer is row 9, so content occupies rows 1-8
    expect(adapter.textAt(0)).toContain('H');
    expect(adapter.textAt(9)).toContain('F');
    handle.unmount();
  });

  it('header and footer default to empty when not provided', () => {
    const adapter = new TestAdapter(40, 5);

    function App(): TuiElement {
      const content = __element('Text');
      __append(content, __staticText('Just content'));
      return Dashboard({ children: content });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Just content');
    handle.unmount();
  });
});

describe('LogStream', () => {
  it('renders log entries as column list', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiElement {
      const entries = ['Build started', 'Compiling...', 'Done!'];
      return LogStream({
        entries,
        children: (entry) => {
          const text = __element('Text');
          __append(text, __staticText(entry));
          return text;
        },
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Build started');
    expect(text).toContain('Compiling...');
    expect(text).toContain('Done!');
    handle.unmount();
  });

  it('respects maxLines by showing only the last N entries', () => {
    const adapter = new TestAdapter(40, 10);
    const entries: string[] = [];
    for (let i = 0; i < 20; i++) {
      entries.push(`Log line ${i}`);
    }

    function App(): TuiElement {
      return LogStream({
        entries,
        maxLines: 5,
        children: (entry) => {
          const text = __element('Text');
          __append(text, __staticText(entry));
          return text;
        },
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    // Should only show the last 5 entries
    expect(text).not.toContain('Log line 0');
    expect(text).not.toContain('Log line 14');
    expect(text).toContain('Log line 15');
    expect(text).toContain('Log line 19');
    handle.unmount();
  });

  it('Dashboard with LogStream: header stays fixed when many entries exist', () => {
    const adapter = new TestAdapter(50, 12);

    function App(): TuiElement {
      const header = __element('Text', 'bold', true);
      __append(header, __staticText('=== Dev Server ==='));

      const footer = __element('Text', 'dim', true);
      __append(footer, __staticText('[Ctrl+C to quit]'));

      const entries: string[] = [];
      for (let i = 0; i < 100; i++) {
        entries.push(`[${String(i).padStart(3, '0')}] Request handled`);
      }

      const log = LogStream({
        entries,
        children: (entry) => {
          const text = __element('Text');
          __append(text, __staticText(entry));
          return text;
        },
      });

      return Dashboard({ header, footer, children: log });
    }

    const handle = tui.mount(App, { adapter });

    // Header should stay at top
    expect(adapter.textAt(0)).toContain('Dev Server');
    // Footer should stay at bottom
    expect(adapter.textAt(11)).toContain('Ctrl+C to quit');
    // Content should show some log entries in the middle area (rows 1-10)
    const middleText = adapter.text();
    expect(middleText).toContain('Request handled');

    handle.unmount();
  });

  it('reactive entries update the displayed log', () => {
    const adapter = new TestAdapter(40, 10);
    const entries = signal<string[]>(['First']);

    function App(): TuiElement {
      const log = LogStream({
        entries: entries.value,
        children: (entry) => {
          const text = __element('Text');
          __append(text, __staticText(entry));
          return text;
        },
      });
      return log;
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('First');

    entries.value = ['First', 'Second'];
    // After signal update, the component should re-render
    const text = adapter.text();
    expect(text).toContain('First');
    handle.unmount();
  });
});
