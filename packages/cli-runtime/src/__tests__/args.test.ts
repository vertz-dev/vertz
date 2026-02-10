import { describe, expect, it } from 'vitest';
import { parseArgs } from '../args';

describe('parseArgs', () => {
  it('extracts namespace and command from positional args', () => {
    const result = parseArgs(['users', 'list']);
    expect(result.namespace).toBe('users');
    expect(result.command).toBe('list');
  });

  it('parses --flag value pairs into flags', () => {
    const result = parseArgs(['users', 'list', '--page', '2', '--limit', '10']);
    expect(result.flags).toEqual({ page: '2', limit: '10' });
  });

  it('parses boolean flags without values', () => {
    const result = parseArgs(['users', 'list', '--verbose']);
    expect(result.flags).toEqual({ verbose: true });
  });

  it('parses --help as a global flag', () => {
    const result = parseArgs(['--help']);
    expect(result.globalFlags.help).toBe(true);
    expect(result.namespace).toBeUndefined();
  });

  it('parses --version as a global flag', () => {
    const result = parseArgs(['--version']);
    expect(result.globalFlags.version).toBe(true);
  });

  it('parses --output as a global flag with value', () => {
    const result = parseArgs(['users', 'list', '--output', 'json']);
    expect(result.globalFlags.output).toBe('json');
  });

  it('returns empty result for empty argv', () => {
    const result = parseArgs([]);
    expect(result.namespace).toBeUndefined();
    expect(result.command).toBeUndefined();
    expect(result.flags).toEqual({});
  });

  it('handles namespace-level --help', () => {
    const result = parseArgs(['users', '--help']);
    expect(result.namespace).toBe('users');
    expect(result.command).toBeUndefined();
    expect(result.globalFlags.help).toBe(true);
  });

  it('handles --flag=value syntax', () => {
    const result = parseArgs(['users', 'list', '--page=2']);
    expect(result.flags).toEqual({ page: '2' });
  });

  it('handles --output=json equals syntax', () => {
    const result = parseArgs(['users', 'list', '--output=json']);
    expect(result.globalFlags.output).toBe('json');
    expect(result.flags).toEqual({});
  });

  it('does not consume next arg when --output uses equals syntax', () => {
    const result = parseArgs(['users', 'list', '--output=json', '--verbose']);
    expect(result.globalFlags.output).toBe('json');
    expect(result.flags).toEqual({ verbose: true });
  });

  it('handles --output as last arg without value', () => {
    const result = parseArgs(['users', 'list', '--output']);
    expect(result.globalFlags.output).toBeUndefined();
  });
});
