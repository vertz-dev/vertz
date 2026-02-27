import { describe, expect, it } from 'bun:test';
import type { AppIR, EntityAccessIR, EntityIR } from '@vertz/compiler';
import { createEmptyAppIR } from '@vertz/compiler';
import { adaptIR } from '../ir-adapter';

describe('IR Adapter - Entities', () => {
  function createBasicEntity(name: string, accessOverrides?: Partial<EntityAccessIR>): EntityIR {
    const defaultAccess: EntityAccessIR = {
      list: 'none',
      get: 'none',
      create: 'none',
      update: 'none',
      delete: 'none',
      custom: {},
    };

    return {
      name,
      modelRef: {
        variableName: `${name}Model`,
        schemaRefs: { resolved: true },
      },
      access: { ...defaultAccess, ...accessOverrides },
      hooks: { before: [], after: [] },
      actions: [],
      relations: [],
      sourceFile: '/test.ts',
      sourceLine: 1,
      sourceColumn: 1,
    };
  }

  it('adapts EntityIR into CodegenEntityModule', () => {
    const appIR = createEmptyAppIR();
    appIR.entities = [createBasicEntity('user')];

    const result = adaptIR(appIR);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.entityName).toBe('user');
    expect(result.entities[0]?.operations).toHaveLength(5);
  });

  it('filters disabled operations', () => {
    const appIR = createEmptyAppIR();
    appIR.entities = [
      createBasicEntity('user', {
        list: 'none',
        get: 'none',
        create: 'false',
        update: 'false',
        delete: 'false',
      }),
    ];

    const result = adaptIR(appIR);

    expect(result.entities[0]?.operations).toHaveLength(2);
    expect(result.entities[0]?.operations.map((op) => op.kind)).toEqual(['list', 'get']);
  });

  it('includes custom actions', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('user');
    entity.actions = [
      {
        name: 'activate',
        inputSchemaRef: { kind: 'inline', sourceFile: '/test.ts' },
        outputSchemaRef: { kind: 'inline', sourceFile: '/test.ts' },
        sourceFile: '/test.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    expect(result.entities[0]?.actions).toHaveLength(1);
    expect(result.entities[0]?.actions[0]?.name).toBe('activate');
  });

  it('sets schema names when resolved', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('user');
    entity.modelRef.schemaRefs = {
      response: { kind: 'inline', sourceFile: '/test.ts' },
      createInput: { kind: 'inline', sourceFile: '/test.ts' },
      updateInput: { kind: 'inline', sourceFile: '/test.ts' },
      resolved: true,
    };
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    const createOp = result.entities[0]?.operations.find((op) => op.kind === 'create');
    const updateOp = result.entities[0]?.operations.find((op) => op.kind === 'update');
    const getOp = result.entities[0]?.operations.find((op) => op.kind === 'get');

    expect(createOp?.inputSchema).toBe('CreateUserInput');
    expect(createOp?.outputSchema).toBe('UserResponse');
    expect(updateOp?.inputSchema).toBe('UpdateUserInput');
    expect(updateOp?.outputSchema).toBe('UserResponse');
    expect(getOp?.outputSchema).toBe('UserResponse');
  });

  it('uses undefined schema names when unresolved', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('user');
    entity.modelRef.schemaRefs = { resolved: false };
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    const createOp = result.entities[0]?.operations.find((op) => op.kind === 'create');
    expect(createOp?.inputSchema).toBeUndefined();
    expect(createOp?.outputSchema).toBeUndefined();
  });

  it('handles empty entities array', () => {
    const appIR = createEmptyAppIR();
    appIR.entities = [];

    const result = adaptIR(appIR);

    expect(result.entities).toEqual([]);
  });
});
