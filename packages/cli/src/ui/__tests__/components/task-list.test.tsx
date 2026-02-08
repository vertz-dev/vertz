import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { TaskList } from '../../components/TaskList';
import { symbols } from '../../theme';

describe('TaskList', () => {
  it('renders group title', () => {
    const { lastFrame } = render(<TaskList title="Build" tasks={[]} />);
    expect(lastFrame()).toContain('Build');
  });

  it('renders tasks with their names', () => {
    const tasks = [
      { name: 'Compiling', status: 'done' as const },
      { name: 'Type checking', status: 'running' as const },
    ];
    const { lastFrame } = render(<TaskList title="Build" tasks={tasks} />);
    expect(lastFrame()).toContain('Compiling');
    expect(lastFrame()).toContain('Type checking');
  });

  it('renders task status symbols', () => {
    const tasks = [
      { name: 'Done task', status: 'done' as const },
      { name: 'Error task', status: 'error' as const },
    ];
    const { lastFrame } = render(<TaskList title="Build" tasks={tasks} />);
    expect(lastFrame()).toContain(symbols.success);
    expect(lastFrame()).toContain(symbols.error);
  });

  it('renders empty list with just the title', () => {
    const { lastFrame } = render(<TaskList title="Empty" tasks={[]} />);
    expect(lastFrame()).toContain('Empty');
  });
});
