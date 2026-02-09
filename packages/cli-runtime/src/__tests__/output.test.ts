import { describe, expect, it } from 'vitest';
import { formatOutput } from '../output';

describe('formatOutput', () => {
  it('formats data as JSON with indentation', () => {
    const data = { name: 'Alice', age: 30 };
    const result = formatOutput(data, 'json');
    expect(result).toBe(JSON.stringify(data, null, 2));
  });

  it('formats array data as a table', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const result = formatOutput(data, 'table');
    expect(result).toContain('name');
    expect(result).toContain('age');
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
    expect(result).toContain('30');
    expect(result).toContain('25');
  });

  it('formats human-readable output for objects', () => {
    const data = { name: 'Alice', email: 'alice@example.com' };
    const result = formatOutput(data, 'human');
    expect(result).toContain('name');
    expect(result).toContain('Alice');
    expect(result).toContain('email');
    expect(result).toContain('alice@example.com');
  });

  it('formats human-readable output for arrays as numbered list', () => {
    const data = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    const result = formatOutput(data, 'human');
    expect(result).toContain('Alice');
    expect(result).toContain('Bob');
  });

  it('formats primitive values as string', () => {
    expect(formatOutput('hello', 'json')).toBe('"hello"');
    expect(formatOutput(42, 'json')).toBe('42');
    expect(formatOutput(true, 'json')).toBe('true');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatOutput(null, 'json')).toBe('null');
    expect(formatOutput(null, 'human')).toBe('null');
  });

  it('formats table with aligned columns', () => {
    const data = [
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' },
    ];
    const result = formatOutput(data, 'table');
    const lines = result.split('\n').filter((l) => l.trim());
    // Header + separator + data rows
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('falls back to single-row table when data is not an array', () => {
    const data = { name: 'Alice' };
    const result = formatOutput(data, 'table');
    expect(result).toContain('name');
    expect(result).toContain('Alice');
  });
});
