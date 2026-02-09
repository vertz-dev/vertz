import { describe, expect, it } from 'vitest';
import { createCLI } from '../cli';
import type { CommandManifest } from '../types';

const testManifest: CommandManifest = {
  users: {
    list: {
      method: 'GET',
      path: '/api/v1/users',
      description: 'List all users',
      query: {
        page: { type: 'number', description: 'Page number', required: false },
      },
    },
    get: {
      method: 'GET',
      path: '/api/v1/users/:id',
      description: 'Get a user by ID',
      params: {
        id: { type: 'string', description: 'User ID', required: true },
      },
    },
  },
  orders: {
    list: {
      method: 'GET',
      path: '/api/v1/orders',
      description: 'List all orders',
    },
  },
};

function createTestCLI(manifestOverride?: CommandManifest) {
  const output: string[] = [];
  const errors: string[] = [];

  const config: CLIConfig = {
    name: 'testapp',
    version: '1.0.0',
    commands: manifestOverride ?? testManifest,
  };

  const cli = createCLI(config, {
    output: (text) => output.push(text),
    errorOutput: (text) => errors.push(text),
  });

  return { cli, output, errors };
}

describe('createCLI', () => {
  it('shows version with --version', async () => {
    const { cli, output } = createTestCLI();
    await cli.run(['--version']);
    expect(output).toEqual(['testapp v1.0.0']);
  });

  it('shows top-level help with no args', async () => {
    const { cli, output } = createTestCLI();
    await cli.run([]);
    expect(output[0]).toContain('testapp');
    expect(output[0]).toContain('Usage:');
    expect(output[0]).toContain('users');
    expect(output[0]).toContain('orders');
  });

  it('shows top-level help with --help', async () => {
    const { cli, output } = createTestCLI();
    await cli.run(['--help']);
    expect(output[0]).toContain('testapp');
    expect(output[0]).toContain('Usage:');
  });

  it('shows namespace help when only namespace is provided', async () => {
    const { cli, output } = createTestCLI();
    await cli.run(['users']);
    expect(output[0]).toContain('users');
    expect(output[0]).toContain('list');
    expect(output[0]).toContain('get');
  });

  it('shows namespace help with --help flag', async () => {
    const { cli, output } = createTestCLI();
    await cli.run(['users', '--help']);
    expect(output[0]).toContain('users');
    expect(output[0]).toContain('list');
    expect(output[0]).toContain('get');
  });

  it('shows command help with --help flag', async () => {
    const { cli, output } = createTestCLI();
    await cli.run(['users', 'list', '--help']);
    expect(output[0]).toContain('List all users');
    expect(output[0]).toContain('--page');
  });

  it('shows error for unknown namespace', async () => {
    const { cli, errors } = createTestCLI();
    await cli.run(['invalid']);
    expect(errors[0]).toContain('Unknown namespace: invalid');
  });

  it('shows error for unknown command', async () => {
    const { cli, errors } = createTestCLI();
    await cli.run(['users', 'invalid']);
    expect(errors[0]).toContain('Unknown command: users invalid');
  });

  it('returns a CLIRuntime object with run method', () => {
    const { cli } = createTestCLI();
    expect(cli).toHaveProperty('run');
    expect(typeof cli.run).toBe('function');
  });
});
