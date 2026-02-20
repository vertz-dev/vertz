import { describe, it, expect } from 'vitest';
import type { CodegenEntityModule, CodegenIR } from '../../types';
import { EntitySdkGenerator } from '../entity-sdk-generator';

describe('EntitySdkGenerator', () => {
  const generator = new EntitySdkGenerator();

  function createBasicIR(entities: CodegenEntityModule[]): CodegenIR {
    return {
      basePath: '/api',
      modules: [],
      schemas: [],
      entities,
      auth: { schemes: [] },
    };
  }

  it('generates typed SDK for entity with all CRUD operations', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/user',
            operationId: 'listUser',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'get',
            method: 'GET',
            path: '/user/:id',
            operationId: 'getUser',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'create',
            method: 'POST',
            path: '/user',
            operationId: 'createUser',
            inputSchema: 'CreateUserInput',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'update',
            method: 'PATCH',
            path: '/user/:id',
            operationId: 'updateUser',
            inputSchema: 'UpdateUserInput',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'delete',
            method: 'DELETE',
            path: '/user/:id',
            operationId: 'deleteUser',
            outputSchema: 'UserResponse',
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile).toBeDefined();
    expect(userFile?.content).toContain('export function createUserSdk');
    expect(userFile?.content).toContain('list:');
    expect(userFile?.content).toContain('get:');
    expect(userFile?.content).toContain('create:');
    expect(userFile?.content).toContain('update:');
    expect(userFile?.content).toContain('delete:');
  });

  it('generates SDK with custom actions', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'get',
            method: 'GET',
            path: '/user/:id',
            operationId: 'getUser',
            outputSchema: 'UserResponse',
          },
        ],
        actions: [
          {
            name: 'activate',
            operationId: 'activateUser',
            path: '/user/:id/activate',
            inputSchema: 'ActivateUserInput',
            outputSchema: 'ActivateUserOutput',
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('activate:');
  });

  it('generates SDK with unknown types when schemas unresolved', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/user',
            operationId: 'listUser',
            // No schema refs
          },
          {
            kind: 'create',
            method: 'POST',
            path: '/user',
            operationId: 'createUser',
            // No schema refs
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('client.get<unknown[]>');
    expect(userFile?.content).toContain('(body: unknown)');
  });

  it('generates index file re-exporting all entity SDKs', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [],
        actions: [],
      },
      {
        entityName: 'post',
        operations: [],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const indexFile = files.find((f) => f.path === 'entities/index.ts');

    expect(indexFile).toBeDefined();
    expect(indexFile?.content).toContain("export { createUserSdk } from './user'");
    expect(indexFile?.content).toContain("export { createPostSdk } from './post'");
  });

  it('handles entity with some CRUD disabled', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/user',
            operationId: 'listUser',
            outputSchema: 'UserResponse',
          },
          {
            kind: 'get',
            method: 'GET',
            path: '/user/:id',
            operationId: 'getUser',
            outputSchema: 'UserResponse',
          },
        ],
        actions: [],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('list:');
    expect(userFile?.content).toContain('get:');
    expect(userFile?.content).not.toContain('create:');
  });

  it('handles entity with only custom actions (no CRUD)', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [],
        actions: [
          {
            name: 'activate',
            operationId: 'activateUser',
            path: '/user/:id/activate',
            inputSchema: 'ActivateUserInput',
            outputSchema: 'ActivateUserOutput',
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'entities/user.ts');

    expect(userFile?.content).toContain('activate:');
    expect(userFile?.content).not.toContain('list:');
  });

  it('returns empty array when no entities', () => {
    const ir = createBasicIR([]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });

    expect(files).toEqual([]);
  });
});
