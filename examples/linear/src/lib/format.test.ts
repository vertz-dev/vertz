import { describe, expect, it } from 'bun:test';
import { formatRelativeTime } from './format';

describe('formatRelativeTime', () => {
  it('returns "just now" for dates less than 1 minute ago', () => {
    const now = new Date();
    expect(formatRelativeTime(now.toISOString())).toBe('just now');
  });

  it('returns minutes ago for dates less than 1 hour ago', () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(date.toISOString())).toBe('5m ago');
  });

  it('returns hours ago for dates less than 24 hours ago', () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(date.toISOString())).toBe('3h ago');
  });

  it('returns days ago for dates less than 7 days ago', () => {
    const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date.toISOString())).toBe('2d ago');
  });

  it('returns formatted date for dates older than 7 days', () => {
    const date = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(date.toISOString());
    expect(result).not.toContain('ago');
    expect(result).not.toBe('just now');
  });

  it('returns formatted date for future dates', () => {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    const result = formatRelativeTime(date.toISOString());
    expect(result).not.toContain('ago');
  });
});
