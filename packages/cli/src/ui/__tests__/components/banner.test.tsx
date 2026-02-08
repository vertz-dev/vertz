import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Banner } from '../../components/Banner';

describe('Banner', () => {
  it('renders vertz text', () => {
    const { lastFrame } = render(<Banner version="1.0.0" />);
    expect(lastFrame()).toContain('vertz');
  });

  it('renders version number', () => {
    const { lastFrame } = render(<Banner version="1.0.0" />);
    expect(lastFrame()).toContain('1.0.0');
  });
});
