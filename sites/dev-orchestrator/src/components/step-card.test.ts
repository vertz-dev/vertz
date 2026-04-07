import { describe, expect, it } from 'bun:test';
import { badgeLabel, formatDuration } from './step-card-utils';

describe('badgeLabel()', () => {
  it('returns "pending" for pending status', () => {
    expect(badgeLabel('pending')).toBe('pending');
  });

  it('returns "running" for active status', () => {
    expect(badgeLabel('active')).toBe('running');
  });

  it('returns "done" for completed status', () => {
    expect(badgeLabel('completed')).toBe('done');
  });

  it('returns "failed" for failed status', () => {
    expect(badgeLabel('failed')).toBe('failed');
  });
});

describe('formatDuration()', () => {
  it('formats sub-second durations in milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats durations >= 1s in seconds with one decimal', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(60000)).toBe('60.0s');
  });
});
