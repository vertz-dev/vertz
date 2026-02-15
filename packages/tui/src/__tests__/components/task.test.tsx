import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Task } from '../../components/Task';
import { symbols } from '../../theme';

describe('Task', () => {
  it('renders task name', () => {
    const { lastFrame } = render(<Task name="Compiling" status="pending" />);
    expect(lastFrame()).toContain('Compiling');
  });

  it('shows pending symbol when status is pending', () => {
    const { lastFrame } = render(<Task name="Compiling" status="pending" />);
    expect(lastFrame()).toContain(symbols.dash);
  });

  it('shows success symbol when status is done', () => {
    const { lastFrame } = render(<Task name="Compiling" status="done" />);
    expect(lastFrame()).toContain(symbols.success);
  });

  it('shows running indicator when status is running', () => {
    const { lastFrame } = render(<Task name="Compiling" status="running" />);
    expect(lastFrame()).toContain(symbols.pointer);
  });

  it('shows error symbol when status is error', () => {
    const { lastFrame } = render(<Task name="Compiling" status="error" />);
    expect(lastFrame()).toContain(symbols.error);
  });

  it('displays optional detail message', () => {
    const { lastFrame } = render(<Task name="Compiling" status="running" detail="src/app.ts" />);
    expect(lastFrame()).toContain('src/app.ts');
  });
});
