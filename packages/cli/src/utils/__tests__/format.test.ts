import { describe, expect, it } from 'bun:test';
import { formatDuration, formatFileSize, formatPath } from '../format';

describe('formatDuration', () => {
  it('formats milliseconds below 1000 as ms', () => {
    expect(formatDuration(42)).toBe('42ms');
  });

  it('rounds sub-second values', () => {
    expect(formatDuration(42.7)).toBe('43ms');
  });

  it('formats zero as 0ms', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formats 1000ms as 1.00s', () => {
    expect(formatDuration(1000)).toBe('1.00s');
  });

  it('formats seconds with two decimal places', () => {
    expect(formatDuration(1500)).toBe('1.50s');
  });

  it('formats large values in seconds', () => {
    expect(formatDuration(62340)).toBe('62.34s');
  });
});

describe('formatFileSize', () => {
  it('formats bytes below 1024 with B suffix', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats kilobytes with one decimal', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes with one decimal', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('formats fractional kilobytes', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });
});

describe('formatPath', () => {
  it('strips cwd prefix to make relative', () => {
    expect(formatPath('/project/src/app.ts', '/project')).toBe('src/app.ts');
  });

  it('returns absolute path when not under cwd', () => {
    expect(formatPath('/other/file.ts', '/project')).toBe('/other/file.ts');
  });

  it('handles cwd that equals the path', () => {
    expect(formatPath('/project', '/project')).toBe('');
  });
});
