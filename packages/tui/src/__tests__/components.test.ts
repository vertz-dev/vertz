import { describe, expect, it } from 'vitest';
import { tui } from '../app';
import { Confirm } from '../components/Confirm';
import { MultiSelect } from '../components/MultiSelect';
import { PasswordInput } from '../components/PasswordInput';
import { Select } from '../components/Select';
import { Spinner } from '../components/Spinner';
import { TextInput } from '../components/TextInput';
import type { TuiNode } from '../nodes/types';
import { TestAdapter } from '../test/test-adapter';
import { TestStdin } from '../test/test-stdin';

describe('Select', () => {
  it('renders message and options', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return Select({
        message: 'Pick:',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Pick:');
    expect(text).toContain('A');
    expect(text).toContain('B');
    handle.unmount();
  });

  it('navigates with arrow keys and submits', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    let result = '';

    function App(): TuiNode {
      return Select({
        message: 'Pick:',
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
        ],
        onSubmit: (v: string) => {
          result = v;
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    testStdin.pressKey('down');
    testStdin.pressKey('return');
    expect(result).toBe('b');
    handle.unmount();
  });

  it('shows hints', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return Select({
        message: 'Runtime:',
        options: [{ label: 'Bun', value: 'bun', hint: 'recommended' }],
      });
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('recommended');
    handle.unmount();
  });
});

describe('MultiSelect', () => {
  it('renders message and options with checkboxes', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return MultiSelect({
        message: 'Features:',
        options: [
          { label: 'TypeScript', value: 'ts' },
          { label: 'Biome', value: 'biome' },
        ],
      });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Features:');
    expect(text).toContain('TypeScript');
    expect(text).toContain('Biome');
    handle.unmount();
  });

  it('toggles selection with space and submits', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    let result: string[] = [];

    function App(): TuiNode {
      return MultiSelect({
        message: 'Features:',
        options: [
          { label: 'TypeScript', value: 'ts' },
          { label: 'Biome', value: 'biome' },
          { label: 'ESLint', value: 'eslint' },
        ],
        onSubmit: (v: string[]) => {
          result = v;
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    // Select first item
    testStdin.pressKey('space');
    // Move down and select third
    testStdin.pressKey('down');
    testStdin.pressKey('down');
    testStdin.pressKey('space');
    // Submit
    testStdin.pressKey('return');
    expect(result).toEqual(['ts', 'eslint']);
    handle.unmount();
  });

  it('supports defaultValue', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    let result: string[] = [];

    function App(): TuiNode {
      return MultiSelect({
        message: 'Features:',
        options: [
          { label: 'TypeScript', value: 'ts' },
          { label: 'Biome', value: 'biome' },
        ],
        defaultValue: ['ts'],
        onSubmit: (v: string[]) => {
          result = v;
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    // Submit without changing — should get default
    testStdin.pressKey('return');
    expect(result).toEqual(['ts']);
    handle.unmount();
  });
});

describe('Confirm', () => {
  it('renders message with Yes/No', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return Confirm({ message: 'Proceed?' });
    }

    const handle = tui.mount(App, { adapter });
    const text = adapter.text();
    expect(text).toContain('Proceed?');
    expect(text).toContain('Yes');
    expect(text).toContain('No');
    handle.unmount();
  });

  it('toggles with arrow keys and submits', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    let result: boolean | null = null;

    function App(): TuiNode {
      return Confirm({
        message: 'Proceed?',
        onSubmit: (v: boolean) => {
          result = v;
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    // Default is true, toggle to false
    testStdin.pressKey('right');
    testStdin.pressKey('return');
    expect(result).toBe(false);
    handle.unmount();
  });

  it('responds to y/n keys', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    let result: boolean | null = null;

    function App(): TuiNode {
      return Confirm({
        message: 'Proceed?',
        onSubmit: (v: boolean) => {
          result = v;
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    testStdin.pressKey('n');
    testStdin.pressKey('return');
    expect(result).toBe(false);
    handle.unmount();
  });
});

describe('TextInput', () => {
  it('renders placeholder when empty', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return TextInput({ placeholder: 'Enter name' });
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('Enter name');
    handle.unmount();
  });

  it('accepts typed characters and submits', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    let result = '';

    function App(): TuiNode {
      return TextInput({
        onSubmit: (v: string) => {
          result = v;
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    testStdin.type('hello');
    testStdin.pressKey('return');
    expect(result).toBe('hello');
    handle.unmount();
  });

  it('handles backspace', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    let result = '';

    function App(): TuiNode {
      return TextInput({
        onSubmit: (v: string) => {
          result = v;
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    testStdin.type('helo');
    testStdin.pressKey('backspace');
    testStdin.type('lo');
    testStdin.pressKey('return');
    expect(result).toBe('hello');
    handle.unmount();
  });

  it('fires onChange on each keystroke', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    const changes: string[] = [];

    function App(): TuiNode {
      return TextInput({
        onChange: (v: string) => {
          changes.push(v);
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    testStdin.type('ab');
    expect(changes).toEqual(['a', 'ab']);
    handle.unmount();
  });
});

describe('PasswordInput', () => {
  it('renders placeholder when empty', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return PasswordInput({ placeholder: 'Enter password' });
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('Enter password');
    handle.unmount();
  });

  it('masks input with bullet characters', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();

    function App(): TuiNode {
      return PasswordInput({});
    }

    const handle = tui.mount(App, { adapter, testStdin });
    testStdin.type('abc');
    // Should show 3 bullet characters
    expect(adapter.text()).toContain('\u2022\u2022\u2022');
    // Should NOT contain the actual text
    expect(adapter.text()).not.toContain('abc');
    handle.unmount();
  });

  it('submits the actual password text', () => {
    const adapter = new TestAdapter(40, 10);
    const testStdin = new TestStdin();
    let result = '';

    function App(): TuiNode {
      return PasswordInput({
        onSubmit: (v: string) => {
          result = v;
        },
      });
    }

    const handle = tui.mount(App, { adapter, testStdin });
    testStdin.type('secret');
    testStdin.pressKey('return');
    expect(result).toBe('secret');
    handle.unmount();
  });
});

describe('Spinner', () => {
  it('renders spinner frame with label', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return Spinner({ label: 'Loading...' });
    }

    const handle = tui.mount(App, { adapter });
    expect(adapter.text()).toContain('Loading...');
    handle.unmount();
  });

  it('renders spinner without label', () => {
    const adapter = new TestAdapter(40, 10);

    function App(): TuiNode {
      return Spinner({});
    }

    const handle = tui.mount(App, { adapter });
    // Should render without error
    expect(adapter.text()).toBeTruthy();
    handle.unmount();
  });
});
