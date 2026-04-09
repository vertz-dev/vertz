import { describe, expect, it } from '@vertz/test';
import { getProviderIcon } from '../provider-icons';

describe('getProviderIcon', () => {
  it('returns SVG string for github', () => {
    const svg = getProviderIcon('github', 20);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="20"');
    expect(svg).toContain('height="20"');
  });

  it('returns SVG string for google', () => {
    const svg = getProviderIcon('google', 24);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="24"');
    expect(svg).toContain('height="24"');
  });

  it('returns SVG string for discord', () => {
    const svg = getProviderIcon('discord', 20);
    expect(svg).toContain('<svg');
  });

  it('returns SVG string for apple', () => {
    const svg = getProviderIcon('apple', 20);
    expect(svg).toContain('<svg');
  });

  it('returns SVG string for microsoft', () => {
    const svg = getProviderIcon('microsoft', 20);
    expect(svg).toContain('<svg');
  });

  it('returns SVG string for twitter', () => {
    const svg = getProviderIcon('twitter', 20);
    expect(svg).toContain('<svg');
  });

  it('returns generic fallback icon for unknown provider', () => {
    const svg = getProviderIcon('foobar', 20);
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="20"');
  });
});
