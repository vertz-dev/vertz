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
        method: 'POST',
        body: { kind: 'inline', sourceFile: '/test.ts' },
        response: { kind: 'inline', sourceFile: '/test.ts' },
        sourceFile: '/test.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    expect(result.entities[0]?.actions).toHaveLength(1);
    expect(result.entities[0]?.actions[0]?.name).toBe('activate');
    expect(result.entities[0]?.actions[0]?.method).toBe('POST');
    expect(result.entities[0]?.actions[0]?.hasId).toBe(true);
    expect(result.entities[0]?.actions[0]?.path).toBe('/user/:id/activate');
  });

  it('maps action method and custom path from IR', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('todo');
    entity.actions = [
      {
        name: 'stats',
        method: 'GET',
        path: 'stats',
        response: { kind: 'named', schemaName: 'StatsResponse', sourceFile: '/test.ts' },
        sourceFile: '/test.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);
    const action = result.entities[0]?.actions[0];
    expect(action?.method).toBe('GET');
    expect(action?.path).toBe('/todo/stats');
    expect(action?.hasId).toBe(false);
    expect(action?.outputSchema).toBe('StatsTodoOutput');
    expect(action?.inputSchema).toBeUndefined();
  });

  it('populates action inputSchema and outputSchema from body/response refs', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('user');
    entity.actions = [
      {
        name: 'activate',
        method: 'POST',
        body: { kind: 'named', schemaName: 'ActivateBody', sourceFile: '/test.ts' },
        response: { kind: 'named', schemaName: 'ActivateResponse', sourceFile: '/test.ts' },
        sourceFile: '/test.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);
    const action = result.entities[0]?.actions[0];
    expect(action?.inputSchema).toBe('ActivateUserInput');
    expect(action?.outputSchema).toBe('ActivateUserOutput');
  });

  it('extracts resolvedFields from inline action body', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('user');
    entity.actions = [
      {
        name: 'invite',
        method: 'POST',
        body: {
          kind: 'inline',
          sourceFile: '/test.ts',
          resolvedFields: [
            { name: 'email', tsType: 'string', optional: false },
            { name: 'role', tsType: 'string', optional: true },
          ],
        },
        sourceFile: '/test.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);
    const action = result.entities[0]?.actions[0];
    expect(action?.resolvedInputFields).toEqual([
      { name: 'email', tsType: 'string', optional: false },
      { name: 'role', tsType: 'string', optional: true },
    ]);
  });

  it('extracts resolvedFields from inline action response', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('user');
    entity.actions = [
      {
        name: 'stats',
        method: 'GET',
        response: {
          kind: 'inline',
          sourceFile: '/test.ts',
          resolvedFields: [
            { name: 'count', tsType: 'number', optional: false },
            { name: 'active', tsType: 'number', optional: false },
          ],
        },
        sourceFile: '/test.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);
    const action = result.entities[0]?.actions[0];
    expect(action?.resolvedOutputFields).toEqual([
      { name: 'count', tsType: 'number', optional: false },
      { name: 'active', tsType: 'number', optional: false },
    ]);
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

  it('maps fully-resolved relations to CodegenRelation[]', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('posts');
    entity.relations = [
      { name: 'author', type: 'one', entity: 'users', selection: 'all' },
      { name: 'tags', type: 'many', entity: 'tags', selection: 'all' },
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    expect(result.entities[0]?.relations).toEqual([
      { name: 'author', type: 'one', entity: 'users' },
      { name: 'tags', type: 'many', entity: 'tags' },
    ]);
  });

  it('filters out relations with missing type or entity', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('posts');
    entity.relations = [
      { name: 'author', type: 'one', entity: 'users', selection: 'all' },
      { name: 'category', selection: 'all' }, // missing type and entity
      { name: 'reviewer', type: 'one', selection: 'all' }, // missing entity
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    expect(result.entities[0]?.relations).toEqual([
      { name: 'author', type: 'one', entity: 'users' },
    ]);
  });

  it('omits relations when none are fully resolved', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('posts');
    entity.relations = [
      { name: 'author', selection: 'all' }, // no type, no entity
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    expect(result.entities[0]?.relations).toBeUndefined();
  });

  it('maps allowWhere, allowOrderBy, maxLimit to relationQueryConfig (#1130)', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('posts');
    entity.relations = [
      {
        name: 'comments',
        type: 'many',
        entity: 'comments',
        selection: ['text', 'status'],
        allowWhere: ['status', 'createdAt'],
        allowOrderBy: ['createdAt'],
        maxLimit: 50,
      },
      { name: 'author', type: 'one', entity: 'users', selection: ['name', 'email'] },
    ];
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    expect(result.entities[0]?.relationQueryConfig).toEqual({
      comments: {
        allowWhere: ['status', 'createdAt'],
        allowOrderBy: ['createdAt'],
        maxLimit: 50,
      },
    });
    // author has no query config fields — should not appear
    expect(result.entities[0]?.relationQueryConfig?.author).toBeUndefined();
  });

  it('omits relationQueryConfig when no relations have query config (#1130)', () => {
    const appIR = createEmptyAppIR();
    const entity = createBasicEntity('posts');
    entity.relations = [{ name: 'author', type: 'one', entity: 'users', selection: 'all' }];
    appIR.entities = [entity];

    const result = adaptIR(appIR);

    expect(result.entities[0]?.relationQueryConfig).toBeUndefined();
  });

  it('handles empty entities array', () => {
    const appIR = createEmptyAppIR();
    appIR.entities = [];

    const result = adaptIR(appIR);

    expect(result.entities).toEqual([]);
  });

  describe('Expose config piping', () => {
    it('maps EntityIR.expose.select to CodegenEntityModule.exposeSelect', () => {
      const appIR = createEmptyAppIR();
      const entity = createBasicEntity('tasks');
      entity.expose = {
        select: [
          { name: 'id', conditional: false },
          { name: 'title', conditional: false },
          { name: 'salary', conditional: true },
        ],
      };
      appIR.entities = [entity];

      const result = adaptIR(appIR);

      expect(result.entities[0]?.exposeSelect).toEqual([
        { name: 'id', conditional: false },
        { name: 'title', conditional: false },
        { name: 'salary', conditional: true },
      ]);
    });

    it('filters responseFields to only exposed non-hidden fields', () => {
      const appIR = createEmptyAppIR();
      const entity = createBasicEntity('tasks');
      entity.modelRef.schemaRefs = {
        response: {
          kind: 'inline',
          sourceFile: '/test.ts',
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'title', tsType: 'string', optional: false },
            { name: 'internalNotes', tsType: 'string', optional: false },
            { name: 'deletedAt', tsType: 'date', optional: true },
          ],
        },
        resolved: true,
      };
      entity.expose = {
        select: [
          { name: 'id', conditional: false },
          { name: 'title', conditional: false },
        ],
      };
      appIR.entities = [entity];

      const result = adaptIR(appIR);

      expect(result.entities[0]?.responseFields).toEqual([
        { name: 'id', tsType: 'string', optional: false },
        { name: 'title', tsType: 'string', optional: false },
      ]);
    });

    it('leaves responseFields unchanged when no expose config', () => {
      const appIR = createEmptyAppIR();
      const entity = createBasicEntity('tasks');
      entity.modelRef.schemaRefs = {
        response: {
          kind: 'inline',
          sourceFile: '/test.ts',
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'title', tsType: 'string', optional: false },
          ],
        },
        resolved: true,
      };
      appIR.entities = [entity];

      const result = adaptIR(appIR);

      expect(result.entities[0]?.responseFields).toEqual([
        { name: 'id', tsType: 'string', optional: false },
        { name: 'title', tsType: 'string', optional: false },
      ]);
      expect(result.entities[0]?.exposeSelect).toBeUndefined();
    });

    it('filters per-operation responseFields by expose config (B1)', () => {
      const appIR = createEmptyAppIR();
      const entity = createBasicEntity('tasks');
      entity.modelRef.schemaRefs = {
        response: {
          kind: 'inline',
          sourceFile: '/test.ts',
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'title', tsType: 'string', optional: false },
            { name: 'internalNotes', tsType: 'string', optional: false },
          ],
        },
        resolved: true,
      };
      entity.expose = {
        select: [
          { name: 'id', conditional: false },
          { name: 'title', conditional: false },
        ],
      };
      appIR.entities = [entity];

      const result = adaptIR(appIR);

      // Per-operation responseFields should also be filtered
      const getOp = result.entities[0]?.operations.find((op) => op.kind === 'get');
      expect(getOp?.responseFields).toEqual([
        { name: 'id', tsType: 'string', optional: false },
        { name: 'title', tsType: 'string', optional: false },
      ]);
    });

    it('resolves expose.include entity/type from relations array (B2)', () => {
      const appIR = createEmptyAppIR();

      // Target entity
      const usersEntity = createBasicEntity('users');
      usersEntity.modelRef.schemaRefs = {
        response: {
          kind: 'inline',
          sourceFile: '/test.ts',
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'name', tsType: 'string', optional: false },
          ],
        },
        resolved: true,
      };

      // Source entity with expose.include WITHOUT explicit entity/type on the relation
      const tasksEntity = createBasicEntity('tasks');
      tasksEntity.relations = [
        { name: 'assignee', type: 'one', entity: 'users', selection: 'all' },
      ];
      tasksEntity.expose = {
        select: [{ name: 'id', conditional: false }],
        include: [
          {
            // No entity/type — should be resolved from relations array
            name: 'assignee',
            select: [
              { name: 'id', conditional: false },
              { name: 'name', conditional: false },
            ],
          },
        ],
      };

      appIR.entities = [usersEntity, tasksEntity];

      const result = adaptIR(appIR);

      const tasksModule = result.entities.find((e) => e.entityName === 'tasks');
      expect(tasksModule?.exposeInclude).toEqual([
        {
          name: 'assignee',
          entity: 'users',
          type: 'one',
          select: [
            { name: 'id', conditional: false },
            { name: 'name', conditional: false },
          ],
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'name', tsType: 'string', optional: false },
          ],
        },
      ]);
    });

    it('maps expose.include with resolved relation fields', () => {
      const appIR = createEmptyAppIR();

      // Target entity (users)
      const usersEntity = createBasicEntity('users');
      usersEntity.modelRef.schemaRefs = {
        response: {
          kind: 'inline',
          sourceFile: '/test.ts',
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'name', tsType: 'string', optional: false },
            { name: 'email', tsType: 'string', optional: false },
          ],
        },
        resolved: true,
      };

      // Source entity (tasks) with expose.include
      const tasksEntity = createBasicEntity('tasks');
      tasksEntity.relations = [
        { name: 'assignee', type: 'one', entity: 'users', selection: 'all' },
      ];
      tasksEntity.expose = {
        select: [{ name: 'id', conditional: false }],
        include: [
          {
            name: 'assignee',
            entity: 'users',
            type: 'one',
            select: [
              { name: 'id', conditional: false },
              { name: 'name', conditional: false },
            ],
          },
        ],
      };

      appIR.entities = [usersEntity, tasksEntity];

      const result = adaptIR(appIR);

      const tasksModule = result.entities.find((e) => e.entityName === 'tasks');
      expect(tasksModule?.exposeInclude).toEqual([
        {
          name: 'assignee',
          entity: 'users',
          type: 'one',
          select: [
            { name: 'id', conditional: false },
            { name: 'name', conditional: false },
          ],
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'name', tsType: 'string', optional: false },
          ],
        },
      ]);
    });

    it('includes all target fields when expose.include has no select', () => {
      const appIR = createEmptyAppIR();

      // Target entity (users) with response fields
      const usersEntity = createBasicEntity('users');
      usersEntity.modelRef.schemaRefs = {
        response: {
          kind: 'inline',
          sourceFile: '/test.ts',
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'name', tsType: 'string', optional: false },
            { name: 'email', tsType: 'string', optional: false },
          ],
        },
        resolved: true,
      };

      // Source entity with expose.include WITHOUT select (should get all target fields)
      const tasksEntity = createBasicEntity('tasks');
      tasksEntity.relations = [
        { name: 'assignee', type: 'one', entity: 'users', selection: 'all' },
      ];
      tasksEntity.expose = {
        select: [{ name: 'id', conditional: false }],
        include: [{ name: 'assignee', entity: 'users', type: 'one' }],
      };

      appIR.entities = [usersEntity, tasksEntity];

      const result = adaptIR(appIR);
      const tasksModule = result.entities.find((e) => e.entityName === 'tasks');
      expect(tasksModule?.exposeInclude).toEqual([
        {
          name: 'assignee',
          entity: 'users',
          type: 'one',
          resolvedFields: [
            { name: 'id', tsType: 'string', optional: false },
            { name: 'name', tsType: 'string', optional: false },
            { name: 'email', tsType: 'string', optional: false },
          ],
        },
      ]);
    });
  });
});
