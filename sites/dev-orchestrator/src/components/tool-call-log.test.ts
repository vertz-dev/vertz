import { describe, expect, it } from '@vertz/test';
import { formatToolDuration } from './tool-call-log-utils';

describe('formatToolDuration()', () => {
  it('formats sub-second durations in milliseconds', () => {
    expect(formatToolDuration(250)).toBe('250ms');
    expect(formatToolDuration(0)).toBe('0ms');
  });

  it('formats durations >= 1s in seconds', () => {
    expect(formatToolDuration(1000)).toBe('1.0s');
    expect(formatToolDuration(2500)).toBe('2.5s');
  });
});
