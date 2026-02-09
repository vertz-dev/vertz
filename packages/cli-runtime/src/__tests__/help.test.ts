import { describe, expect, it } from 'vitest';
import { generateCommandHelp, generateHelp } from '../help';
import type { CommandManifest } from '../types';

const testManifest: CommandManifest = {
  users: {
    list: {
      method: 'GET',
      path: '/api/v1/users',
      description: 'List all users',
      query: {
        page: { type: 'number', description: 'Page number', required: false },
        limit: { type: 'number', description: 'Items per page', required: false },
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
      description: 'Create a new user',
      body: {
        name: { type: 'string', description: 'User name', required: true },
        email: { type: 'string', description: 'User email', required: true },
        role: { type: 'string', enum: ['admin', 'user'], required: false },
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

describe('generateHelp', () => {
  it('includes the CLI name and version', () => {
    const help = generateHelp('myapp', '1.0.0', testManifest);
    expect(help).toContain('myapp');
    expect(help).toContain('1.0.0');
  });

  it('lists all available namespaces', () => {
    const help = generateHelp('myapp', '1.0.0', testManifest);
    expect(help).toContain('users');
    expect(help).toContain('orders');
  });

  it('shows usage pattern', () => {
    const help = generateHelp('myapp', '1.0.0', testManifest);
    expect(help).toContain('Usage:');
    expect(help).toContain('myapp <namespace> <command>');
  });
});

describe('generateCommandHelp', () => {
  it('includes the command description', () => {
    const help = generateCommandHelp('users', 'list', testManifest.users.list);
    expect(help).toContain('List all users');
  });

  it('lists query parameters with types', () => {
    const help = generateCommandHelp('users', 'list', testManifest.users.list);
    expect(help).toContain('--page');
    expect(help).toContain('number');
    expect(help).toContain('Page number');
  });

  it('marks required parameters', () => {
    const help = generateCommandHelp('users', 'get', testManifest.users.get);
    expect(help).toContain('--id');
    expect(help).toContain('required');
  });

  it('shows enum values for enum fields', () => {
    const help = generateCommandHelp('users', 'create', testManifest.users.create);
    expect(help).toContain('admin');
    expect(help).toContain('user');
  });

  it('shows usage with namespace and command', () => {
    const help = generateCommandHelp('users', 'list', testManifest.users.list);
    expect(help).toContain('users list');
  });
});
