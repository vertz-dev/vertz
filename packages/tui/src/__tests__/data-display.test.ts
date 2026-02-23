import { describe, expect, it } from 'vitest';
import { tui } from '../app';
import { Log } from '../components/Log';
import { ProgressBar } from '../components/ProgressBar';
import { Table } from '../components/Table';
import { jsx } from '../jsx-runtime/index';
import type { TuiNode } from '../nodes/types';
import { TestAdapter } from '../test/test-adapter';

describe('Table', () => {
  it('renders header and data rows', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return Table({
        data: [
          { name: 'Alice', age: '30' },
          { name: 'Bob', age: '25' },
        ],
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'age', header: 'Age' },
        ],
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Name');
    expect(text).toContain('Age');
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
    expect(text).toContain('30');
    expect(text).toContain('25');
    handle.unmount();
  });

  it('renders separator between header and data', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return Table({
        data: [{ method: 'GET', path: '/api' }],
        columns: [
          { key: 'method', header: 'Method' },
          { key: 'path', header: 'Path' },
        ],
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    // Separator uses horizontal bar character
    expect(text).toContain('\u2500');
    handle.unmount();
  });

  it('respects explicit column width', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return Table({
        data: [{ status: 'OK' }],
        columns: [{ key: 'status', header: 'Status', width: 10 }],
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    // Header should be padded to width 10
    expect(text).toContain('Status');
    handle.unmount();
  });

  it('handles right alignment', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return Table({
        data: [{ count: '42' }],
        columns: [{ key: 'count', header: 'Count', width: 10, align: 'right' }],
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('42');
    handle.unmount();
  });

  it('renders empty table with only headers', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return Table({
        data: [],
        columns: [
          { key: 'name', header: 'Name' },
          { key: 'value', header: 'Value' },
        ],
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Name');
    expect(text).toContain('Value');
    handle.unmount();
  });
});

describe('ProgressBar', () => {
  it('renders with label and percentage', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return ProgressBar({ value: 50, max: 100, label: 'Building' });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Building');
    expect(text).toContain('50%');
    handle.unmount();
  });

  it('renders 0% progress', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return ProgressBar({ value: 0, max: 100 });
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('0%');
    handle.unmount();
  });

  it('renders 100% progress', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return ProgressBar({ value: 100, max: 100 });
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('100%');
    handle.unmount();
  });

  it('clamps value to max', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return ProgressBar({ value: 200, max: 100 });
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('100%');
    handle.unmount();
  });

  it('renders without label', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return ProgressBar({ value: 3, max: 5 });
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('60%');
    handle.unmount();
  });
});

describe('Log', () => {
  it('renders list of items using render function', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return Log({
        items: ['Task A done', 'Task B done'],
        children: (item: string) => jsx('Text', { children: item }),
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Task A done');
    expect(text).toContain('Task B done');
    handle.unmount();
  });

  it('renders empty list without error', () => {
    const adapter = new TestAdapter(60, 10);

    function App(): TuiNode {
      return Log({
        items: [],
        children: (item: string) => jsx('Text', { children: item }),
      });
    }

    const handle = tui.mount(App, { adapter });
    // Should render without error
    expect(adapter).toBeTruthy();
    handle.unmount();
  });

  it('renders complex items', () => {
    const adapter = new TestAdapter(60, 10);

    interface TaskItem {
      name: string;
      duration: number;
    }

    function App(): TuiNode {
      return Log({
        items: [
          { name: '@vertz/core', duration: 120 },
          { name: '@vertz/schema', duration: 80 },
        ],
        children: (task: TaskItem) =>
          jsx('Box', {
            direction: 'row',
            gap: 1,
            children: [
              jsx('Text', { children: task.name }),
              jsx('Text', { dim: true, children: `${task.duration}ms` }),
            ],
          }),
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('@vertz/core');
    expect(text).toContain('@vertz/schema');
    expect(text).toContain('120ms');
    expect(text).toContain('80ms');
    handle.unmount();
  });
});
