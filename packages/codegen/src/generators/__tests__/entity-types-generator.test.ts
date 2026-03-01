import { describe, expect, it } from 'bun:test';
import type { CodegenEntityModule, CodegenIR } from '../../types';
import { EntityTypesGenerator } from '../entity-types-generator';

describe('EntityTypesGenerator', () => {
  const generator = new EntityTypesGenerator();

  function createBasicIR(entities: CodegenEntityModule[]): CodegenIR {
    return {
      basePath: '/api',
      modules: [],
      schemas: [],
      entities,
      auth: { schemes: [] },
    };
  }

  it('emits interface for action inputSchema when resolvedInputFields exist', () => {
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
            responseFields: [{ name: 'id', tsType: 'string', optional: false }],
          },
        ],
        actions: [
          {
            name: 'activate',
            method: 'POST',
            operationId: 'activateUser',
            path: '/user/:id/activate',
            hasId: true,
            inputSchema: 'ActivateUserInput',
            outputSchema: 'ActivateUserOutput',
            resolvedInputFields: [
              { name: 'reason', tsType: 'string', optional: false },
              { name: 'force', tsType: 'boolean', optional: true },
            ],
            resolvedOutputFields: [{ name: 'activated', tsType: 'boolean', optional: false }],
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'types/user.ts');

    expect(userFile).toBeDefined();
    expect(userFile?.content).toContain('export interface ActivateUserInput');
    expect(userFile?.content).toContain('reason: string');
    expect(userFile?.content).toContain('force?: boolean');
  });

  it('emits interface for action outputSchema when resolvedOutputFields exist', () => {
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
            responseFields: [{ name: 'id', tsType: 'string', optional: false }],
          },
        ],
        actions: [
          {
            name: 'activate',
            method: 'POST',
            operationId: 'activateUser',
            path: '/user/:id/activate',
            hasId: true,
            inputSchema: 'ActivateUserInput',
            outputSchema: 'ActivateUserOutput',
            resolvedInputFields: [{ name: 'reason', tsType: 'string', optional: false }],
            resolvedOutputFields: [
              { name: 'activated', tsType: 'boolean', optional: false },
              { name: 'activatedAt', tsType: 'date', optional: false },
            ],
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'types/user.ts');

    expect(userFile?.content).toContain('export interface ActivateUserOutput');
    expect(userFile?.content).toContain('activated: boolean');
    expect(userFile?.content).toContain('activatedAt: string'); // date → string in JSON
  });

  it('includes entity with only action types (no CRUD types) in output', () => {
    const ir = createBasicIR([
      {
        entityName: 'user',
        operations: [],
        actions: [
          {
            name: 'activate',
            method: 'POST',
            operationId: 'activateUser',
            path: '/user/:id/activate',
            hasId: true,
            inputSchema: 'ActivateUserInput',
            resolvedInputFields: [{ name: 'reason', tsType: 'string', optional: false }],
          },
        ],
      },
    ]);

    const files = generator.generate(ir, { outputDir: '.vertz', options: {} });
    const userFile = files.find((f) => f.path === 'types/user.ts');

    expect(userFile).toBeDefined();
    expect(userFile?.content).toContain('export interface ActivateUserInput');
  });
});
