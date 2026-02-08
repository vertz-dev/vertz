import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Message } from '../../components/Message';
import { symbols } from '../../theme';

describe('Message', () => {
  it('renders info message with info symbol', () => {
    const { lastFrame } = render(<Message type="info">Hello</Message>);
    expect(lastFrame()).toContain(symbols.info);
    expect(lastFrame()).toContain('Hello');
  });

  it('renders error message with error symbol', () => {
    const { lastFrame } = render(<Message type="error">Oops</Message>);
    expect(lastFrame()).toContain(symbols.error);
    expect(lastFrame()).toContain('Oops');
  });

  it('renders warning message with warning symbol', () => {
    const { lastFrame } = render(<Message type="warning">Watch out</Message>);
    expect(lastFrame()).toContain(symbols.warning);
    expect(lastFrame()).toContain('Watch out');
  });

  it('renders success message with success symbol', () => {
    const { lastFrame } = render(<Message type="success">Done</Message>);
    expect(lastFrame()).toContain(symbols.success);
    expect(lastFrame()).toContain('Done');
  });
});
