import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCLI } from '../cli';
import type { CLIConfig, CommandManifest } from '../types';

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
    create: {
      method: 'POST',
      path: '/api/v1/users',
      description: 'Create a user',
      body: {
        name: { type: 'string', description: 'User name', required: true },
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

function createTestCLI(overrides?: { manifest?: CommandManifest; baseURL?: string }) {
  const output: string[] = [];
  const errors: string[] = [];

  const config: CLIConfig = {
    name: 'testapp',
    version: '1.0.0',
    commands: overrides?.manifest ?? testManifest,
  };

  const cli = createCLI(config, {
    output: (text) => output.push(text),
    errorOutput: (text) => errors.push(text),
    baseURL: overrides?.baseURL,
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

  it('shows top-level help with --help for unknown namespace', async () => {
    const { cli, output } = createTestCLI();
    await cli.run(['nonexistent', '--help']);
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

describe('command execution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes a GET command and outputs JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: '1', name: 'Alice' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { cli, output, errors } = createTestCLI({ baseURL: 'http://localhost:9999' });
    await cli.run(['users', 'list']);
    expect(errors).toEqual([]);
    expect(output.length).toBe(1);
    const parsed = JSON.parse(output[0]);
    expect(parsed).toEqual([{ id: '1', name: 'Alice' }]);
  });

  it('executes a GET command with path params', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      expect(url).toContain('/api/v1/users/abc');
      return new Response(JSON.stringify({ id: 'abc', name: 'Alice' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { cli, output, errors } = createTestCLI({ baseURL: 'http://localhost:9999' });
    await cli.run(['users', 'get', '--id', 'abc']);
    expect(errors).toEqual([]);
    expect(output.length).toBe(1);
    const parsed = JSON.parse(output[0]);
    expect(parsed).toEqual({ id: 'abc', name: 'Alice' });
  });

  it('executes a GET command with query params', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      expect(url).toContain('page=2');
      return new Response(JSON.stringify([{ id: '1', name: 'Alice' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { cli, output, errors } = createTestCLI({ baseURL: 'http://localhost:9999' });
    await cli.run(['users', 'list', '--page', '2']);
    expect(errors).toEqual([]);
    expect(output.length).toBe(1);
  });

  it('executes a POST command with body params', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const req = input as Request;
      const body = await req.json();
      expect(body).toEqual({ name: 'Bob' });
      return new Response(JSON.stringify({ id: '2', name: 'Bob' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { cli, output, errors } = createTestCLI({ baseURL: 'http://localhost:9999' });
    await cli.run(['users', 'create', '--name', 'Bob']);
    expect(errors).toEqual([]);
    expect(output.length).toBe(1);
    const parsed = JSON.parse(output[0]);
    expect(parsed).toEqual({ id: '2', name: 'Bob' });
  });

  it('handles HTTP error responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not found' }), {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const { cli, errors } = createTestCLI({ baseURL: 'http://localhost:9999' });
    await cli.run(['orders', 'list']);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('Error:');
  });
});
