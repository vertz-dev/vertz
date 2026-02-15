import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { SelectList } from '../../components/SelectList';
import { symbols } from '../../theme';

const choices = [
  { label: 'Bun', value: 'bun' },
  { label: 'Node', value: 'node' },
  { label: 'Deno', value: 'deno' },
];

describe('SelectList', () => {
  it('renders title', () => {
    const { lastFrame } = render(
      <SelectList title="Pick a runtime" choices={choices} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain('Pick a runtime');
  });

  it('renders all choices', () => {
    const { lastFrame } = render(
      <SelectList title="Pick a runtime" choices={choices} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain('Bun');
    expect(lastFrame()).toContain('Node');
    expect(lastFrame()).toContain('Deno');
  });

  it('highlights selected choice with pointer symbol', () => {
    const { lastFrame } = render(
      <SelectList title="Pick a runtime" choices={choices} selectedIndex={1} />,
    );
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    const nodeLine = lines.find((l) => l.includes('Node'));
    expect(nodeLine).toContain(symbols.pointer);
  });

  it('does not highlight unselected choices', () => {
    const { lastFrame } = render(
      <SelectList title="Pick a runtime" choices={choices} selectedIndex={1} />,
    );
    const frame = lastFrame() ?? '';
    const lines = frame.split('\n');
    const bunLine = lines.find((l) => l.includes('Bun'));
    expect(bunLine).not.toContain(symbols.pointer);
  });
});
