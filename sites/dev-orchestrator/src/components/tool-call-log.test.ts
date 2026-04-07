import { describe, expect, it } from 'bun:test';
import { formatToolDuration, truncateJson } from './tool-call-log-utils';

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

describe('truncateJson()', () => {
  it('returns short strings unchanged', () => {
    expect(truncateJson('{"key":"val"}')).toBe('{"key":"val"}');
  });

  it('truncates strings exceeding maxLength', () => {
    const long = 'a'.repeat(300);
    const result = truncateJson(long, 200);
    expect(result.length).toBe(203); // 200 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('respects custom maxLength', () => {
    const result = truncateJson('abcdefghij', 5);
    expect(result).toBe('abcde...');
  });
});
