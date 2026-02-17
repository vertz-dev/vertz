import { batch, signal } from '@vertz/ui';
import { describe, expect, it } from 'vitest';
import { Message, SelectList, symbols, Task, TaskList, tui } from '../index';

describe('Feature: TUI Reactivity', () => {
  describe('Given a TUI component using signals', () => {
    describe('When the signal value changes', () => {
      it('then the TUI component re-renders with the new value', () => {
        // Create a reactive counter signal
        const count = signal(0);

        // Create a Message component that reads from the signal
        const message = Message({
          type: 'info',
          children: () => `Count: ${count.value}`,
        });

        // Initial render
        const output1 = tui.render(message);
        expect(output1).toContain('Count: 0');

        // Update the signal - this should trigger a re-render
        count.value = 42;

        // Re-render and verify the new value
        const output2 = tui.reRender();
        expect(output2).toContain('Count: 42');
      });
    });
  });
});

describe('Message', () => {
  it('renders info message with info symbol', () => {
    const message = Message({
      type: 'info',
      children: 'Hello',
    });
    const output = tui.render(message);
    expect(output).toContain(symbols.info);
    expect(output).toContain('Hello');
  });

  it('renders error message with error symbol', () => {
    const message = Message({
      type: 'error',
      children: 'Oops',
    });
    const output = tui.render(message);
    expect(output).toContain(symbols.error);
    expect(output).toContain('Oops');
  });

  it('renders warning message with warning symbol', () => {
    const message = Message({
      type: 'warning',
      children: 'Watch out',
    });
    const output = tui.render(message);
    expect(output).toContain(symbols.warning);
    expect(output).toContain('Watch out');
  });

  it('renders success message with success symbol', () => {
    const message = Message({
      type: 'success',
      children: 'Done',
    });
    const output = tui.render(message);
    expect(output).toContain(symbols.success);
    expect(output).toContain('Done');
  });

  it('re-renders when children signal changes', () => {
    const text = signal('initial');
    const message = Message({
      type: 'info',
      children: () => text.value,
    });

    const output1 = tui.render(message);
    expect(output1).toContain('initial');

    text.value = 'updated';
    const output2 = tui.reRender();
    expect(output2).toContain('updated');
  });
});

describe('SelectList', () => {
  const choices = [
    { label: 'Bun', value: 'bun' },
    { label: 'Node', value: 'node' },
    { label: 'Deno', value: 'deno' },
  ];

  it('renders title', () => {
    const selectedIndex = signal(0);
    const selectList = SelectList({
      title: () => 'Pick a runtime',
      choices: () => choices,
      selectedIndex,
    });
    const output = tui.render(selectList);
    expect(output).toContain('Pick a runtime');
  });

  it('renders all choices', () => {
    const selectedIndex = signal(0);
    const selectList = SelectList({
      title: () => 'Pick a runtime',
      choices: () => choices,
      selectedIndex,
    });
    const output = tui.render(selectList);
    expect(output).toContain('Bun');
    expect(output).toContain('Node');
    expect(output).toContain('Deno');
  });

  it('highlights selected choice with pointer symbol', () => {
    const selectedIndex = signal(1);
    const selectList = SelectList({
      title: () => 'Pick a runtime',
      choices: () => choices,
      selectedIndex,
    });
    const output = tui.render(selectList);
    const lines = output.split('\n');
    const nodeLine = lines.find((l) => l.includes('Node'));
    expect(nodeLine).toContain(symbols.pointer);
  });

  it('does not highlight unselected choices', () => {
    const selectedIndex = signal(1);
    const selectList = SelectList({
      title: () => 'Pick a runtime',
      choices: () => choices,
      selectedIndex,
    });
    const output = tui.render(selectList);
    const lines = output.split('\n');
    const bunLine = lines.find((l) => l.includes('Bun'));
    expect(bunLine).not.toContain(symbols.pointer);
  });

  it('re-renders when selectedIndex changes', () => {
    const selectedIndex = signal(0);
    const selectList = SelectList({
      title: () => 'Pick a runtime',
      choices: () => choices,
      selectedIndex,
    });

    const output1 = tui.render(selectList);
    expect(output1.split('\n')[1]).toContain(symbols.pointer);

    // Change selection
    selectedIndex.value = 2;
    const output2 = tui.reRender();
    expect(output2.split('\n')[3]).toContain(symbols.pointer);
  });
});

describe('Task', () => {
  it('renders task name', () => {
    const status = signal('pending' as const);
    const task = Task({
      name: () => 'Compiling',
      status,
    });
    const output = tui.render(task);
    expect(output).toContain('Compiling');
  });

  it('shows pending symbol when status is pending', () => {
    const status = signal('pending' as const);
    const task = Task({
      name: () => 'Compiling',
      status,
    });
    const output = tui.render(task);
    expect(output).toContain(symbols.dash);
  });

  it('shows success symbol when status is done', () => {
    const status = signal('done' as const);
    const task = Task({
      name: () => 'Compiling',
      status,
    });
    const output = tui.render(task);
    expect(output).toContain(symbols.success);
  });

  it('shows running indicator when status is running', () => {
    const status = signal('running' as const);
    const task = Task({
      name: () => 'Compiling',
      status,
    });
    const output = tui.render(task);
    expect(output).toContain(symbols.pointer);
  });

  it('shows error symbol when status is error', () => {
    const status = signal('error' as const);
    const task = Task({
      name: () => 'Compiling',
      status,
    });
    const output = tui.render(task);
    expect(output).toContain(symbols.error);
  });

  it('displays optional detail message', () => {
    const status = signal('running' as const);
    const detail = signal('src/app.ts');
    const task = Task({
      name: () => 'Compiling',
      status,
      detail,
    });
    const output = tui.render(task);
    expect(output).toContain('src/app.ts');
  });

  it('re-renders when status signal changes', () => {
    const status = signal('pending' as const);
    const task = Task({
      name: () => 'Compiling',
      status,
    });

    const output1 = tui.render(task);
    expect(output1).toContain(symbols.dash);

    // Change status
    status.value = 'done';
    const output2 = tui.reRender();
    expect(output2).toContain(symbols.success);
  });

  it('re-renders when detail signal changes', () => {
    const status = signal('running' as const);
    const detail = signal('file1.ts');
    const task = Task({
      name: () => 'Compiling',
      status,
      detail,
    });

    const output1 = tui.render(task);
    expect(output1).toContain('file1.ts');

    // Change detail
    detail.value = 'file2.ts';
    const output2 = tui.reRender();
    expect(output2).toContain('file2.ts');
  });
});

describe('TaskList', () => {
  it('renders group title', () => {
    const tasks = signal<
      Array<{
        name: string;
        status: 'pending' | 'running' | 'done' | 'error';
        detail?: string;
      }>
    >([]);
    const taskList = TaskList({
      title: () => 'Build',
      tasks,
    });
    const output = tui.render(taskList);
    expect(output).toContain('Build');
  });

  it('renders tasks with their names', () => {
    const tasks = signal([
      { name: 'Compiling', status: 'done' as const },
      { name: 'Type checking', status: 'running' as const },
    ]);
    const taskList = TaskList({
      title: () => 'Build',
      tasks,
    });
    const output = tui.render(taskList);
    expect(output).toContain('Compiling');
    expect(output).toContain('Type checking');
  });

  it('renders task status symbols', () => {
    const tasks = signal([
      { name: 'Done task', status: 'done' as const },
      { name: 'Error task', status: 'error' as const },
    ]);
    const taskList = TaskList({
      title: () => 'Build',
      tasks,
    });
    const output = tui.render(taskList);
    expect(output).toContain(symbols.success);
    expect(output).toContain(symbols.error);
  });

  it('renders empty list with just the title', () => {
    const tasks = signal<Array<{ name: string; status: 'pending' | 'running' | 'done' | 'error' }>>(
      [],
    );
    const taskList = TaskList({
      title: () => 'Empty',
      tasks,
    });
    const output = tui.render(taskList);
    expect(output).toContain('Empty');
  });

  it('re-renders when tasks array changes', () => {
    const tasks = signal([{ name: 'Task 1', status: 'pending' as const }]);
    const taskList = TaskList({
      title: () => 'Build',
      tasks,
    });

    const output1 = tui.render(taskList);
    expect(output1).toContain('Task 1');
    expect(output1).not.toContain('Task 2');

    // Add a task
    tasks.value = [
      { name: 'Task 1', status: 'done' as const },
      { name: 'Task 2', status: 'running' as const },
    ];
    const output2 = tui.reRender();
    expect(output2).toContain('Task 1');
    expect(output2).toContain('Task 2');
  });

  it('re-renders when task status changes using batch', () => {
    const tasks = signal([{ name: 'Task 1', status: 'pending' as const }]);
    const taskList = TaskList({
      title: () => 'Build',
      tasks,
    });

    const output1 = tui.render(taskList);
    expect(output1).toContain(symbols.dash);

    // Change status using batch
    batch(() => {
      tasks.value = [{ name: 'Task 1', status: 'done' as const }];
    });
    const output2 = tui.reRender();
    expect(output2).toContain(symbols.success);
  });
});
