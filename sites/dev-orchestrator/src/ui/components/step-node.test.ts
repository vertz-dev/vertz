import { describe, expect, it } from '@vertz/test';
import { stepNodeBorderColor, stepNodeBackground } from './step-node-utils';

describe('stepNodeBorderColor()', () => {
  it('returns primary for selected', () => {
    expect(stepNodeBorderColor('pending', true)).toBe('var(--color-primary)');
  });

  it('returns blue for active', () => {
    expect(stepNodeBorderColor('active')).toBe('hsl(217, 91%, 60%)');
  });

  it('returns green for completed', () => {
    expect(stepNodeBorderColor('completed')).toBe('hsl(142, 76%, 36%)');
  });

  it('returns red for failed', () => {
    expect(stepNodeBorderColor('failed')).toBe('hsl(0, 84%, 60%)');
  });

  it('returns border color for undefined/pending', () => {
    expect(stepNodeBorderColor(undefined)).toBe('var(--color-border)');
    expect(stepNodeBorderColor('pending')).toBe('var(--color-border)');
  });
});

describe('stepNodeBackground()', () => {
  it('returns accent for selected', () => {
    expect(stepNodeBackground('pending', true)).toBe('var(--color-accent)');
  });

  it('returns tinted blue for active', () => {
    expect(stepNodeBackground('active')).toContain('hsl(217');
  });

  it('returns card color for default', () => {
    expect(stepNodeBackground(undefined)).toBe('var(--color-card)');
  });
});
