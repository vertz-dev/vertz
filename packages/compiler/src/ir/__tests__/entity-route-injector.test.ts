import { describe, it, expect, beforeEach } from 'vitest';
import { createEmptyAppIR } from '../builder';
import { injectEntityRoutes, detectRouteCollisions } from '../entity-route-injector';
import type { AppIR, EntityIR, EntityAccessIR } from '../types';

describe('Entity Route Injector', () => {
  let ir: AppIR;

  beforeEach(() => {
    ir = createEmptyAppIR();
  });

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

  describe('Route Generation', () => {
    it('generates 5 CRUD routes for basic entity', () => {
      ir.entities = [createBasicEntity('user')];
      injectEntityRoutes(ir);

      const entityModule = ir.modules.find((m) => m.name === '__entities');
      expect(entityModule).toBeDefined();

      const routes = entityModule?.routers[0]?.routes ?? [];
      expect(routes).toHaveLength(5);

      const operationIds = routes.map((r) => r.operationId).sort();
      expect(operationIds).toEqual([
        'createUser',
        'deleteUser',
        'getUser',
        'listUser',
        'updateUser',
      ]);
    });

    it('skips routes where access is false', () => {
      ir.entities = [
        createBasicEntity('user', {
          list: 'none',
          get: 'none',
          create: 'false',
          update: 'false',
          delete: 'false',
        }),
      ];
      injectEntityRoutes(ir);

      const routes = ir.modules[0]?.routers[0]?.routes ?? [];
      expect(routes).toHaveLength(2);
      expect(routes.map((r) => r.operationId).sort()).toEqual(['getUser', 'listUser']);
    });

    it('generates custom action routes', () => {
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
      ir.entities = [entity];
      injectEntityRoutes(ir);

      const routes = ir.modules[0]?.routers[0]?.routes ?? [];
      const actionRoute = routes.find((r) => r.operationId === 'activateUser');
      expect(actionRoute).toBeDefined();
      expect(actionRoute?.method).toBe('POST');
      expect(actionRoute?.path).toBe('/user/:id/activate');
    });

    it('skips custom action routes where access is false', () => {
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
      entity.access.custom.activate = 'false';
      ir.entities = [entity];
      injectEntityRoutes(ir);

      const routes = ir.modules[0]?.routers[0]?.routes ?? [];
      const actionRoute = routes.find((r) => r.operationId === 'activateUser');
      expect(actionRoute).toBeUndefined();
    });

    it('sets correct operationId (camelCase with PascalCase entity)', () => {
      ir.entities = [createBasicEntity('user-profile')];
      injectEntityRoutes(ir);

      const routes = ir.modules[0]?.routers[0]?.routes ?? [];
      const operationIds = routes.map((r) => r.operationId).sort();
      expect(operationIds).toEqual([
        'createUserProfile',
        'deleteUserProfile',
        'getUserProfile',
        'listUserProfile',
        'updateUserProfile',
      ]);
    });

    it('sets correct HTTP methods and paths', () => {
      ir.entities = [createBasicEntity('user')];
      injectEntityRoutes(ir);

      const routes = ir.modules[0]?.routers[0]?.routes ?? [];
      const listRoute = routes.find((r) => r.operationId === 'listUser');
      const getRoute = routes.find((r) => r.operationId === 'getUser');
      const createRoute = routes.find((r) => r.operationId === 'createUser');
      const updateRoute = routes.find((r) => r.operationId === 'updateUser');
      const deleteRoute = routes.find((r) => r.operationId === 'deleteUser');

      expect(listRoute).toMatchObject({ method: 'GET', path: '/user' });
      expect(getRoute).toMatchObject({ method: 'GET', path: '/user/:id' });
      expect(createRoute).toMatchObject({ method: 'POST', path: '/user' });
      expect(updateRoute).toMatchObject({ method: 'PATCH', path: '/user/:id' });
      expect(deleteRoute).toMatchObject({ method: 'DELETE', path: '/user/:id' });
    });

    it('includes schema refs on routes when model resolved', () => {
      const entity = createBasicEntity('user');
      entity.modelRef.schemaRefs = {
        response: { kind: 'inline', sourceFile: '/test.ts', jsonSchema: { type: 'object' } },
        createInput: { kind: 'inline', sourceFile: '/test.ts', jsonSchema: { type: 'object' } },
        updateInput: { kind: 'inline', sourceFile: '/test.ts', jsonSchema: { type: 'object' } },
        resolved: true,
      };
      ir.entities = [entity];
      injectEntityRoutes(ir);

      const routes = ir.modules[0]?.routers[0]?.routes ?? [];
      const createRoute = routes.find((r) => r.operationId === 'createUser');
      const updateRoute = routes.find((r) => r.operationId === 'updateUser');
      const getRoute = routes.find((r) => r.operationId === 'getUser');

      expect(createRoute?.body).toBeDefined();
      expect(createRoute?.response).toBeDefined();
      expect(updateRoute?.body).toBeDefined();
      expect(updateRoute?.response).toBeDefined();
      expect(getRoute?.response).toBeDefined();
    });

    it('omits schema refs when model unresolved', () => {
      const entity = createBasicEntity('user');
      entity.modelRef.schemaRefs = { resolved: false };
      ir.entities = [entity];
      injectEntityRoutes(ir);

      const routes = ir.modules[0]?.routers[0]?.routes ?? [];
      const createRoute = routes.find((r) => r.operationId === 'createUser');
      expect(createRoute?.body).toBeUndefined();
      expect(createRoute?.response).toBeUndefined();
    });

    it('handles entity with all operations disabled (no routes injected)', () => {
      ir.entities = [
        createBasicEntity('user', {
          list: 'false',
          get: 'false',
          create: 'false',
          update: 'false',
          delete: 'false',
        }),
      ];
      injectEntityRoutes(ir);

      expect(ir.modules.length).toBe(0);
    });

    it('handles multiple entities (no cross-entity collisions)', () => {
      ir.entities = [createBasicEntity('user'), createBasicEntity('post')];
      injectEntityRoutes(ir);

      const routes = ir.modules[0]?.routers[0]?.routes ?? [];
      expect(routes.length).toBe(10);

      const operationIds = routes.map((r) => r.operationId);
      const uniqueIds = new Set(operationIds);
      expect(operationIds.length).toBe(uniqueIds.size);
    });
  });

  describe('Collision Detection', () => {
    it('detects operationId collision with module routes', () => {
      ir.entities = [createBasicEntity('user')];

      // Add a module with a route that will collide
      ir.modules.push({
        name: 'users',
        imports: [],
        services: [],
        routers: [
          {
            name: 'usersRouter',
            moduleName: 'users',
            prefix: '',
            inject: [],
            routes: [
              {
                method: 'GET',
                path: '/users',
                fullPath: '/users',
                operationId: 'listUser', // This will collide
                middleware: [],
                tags: [],
                sourceFile: '/test.ts',
                sourceLine: 1,
                sourceColumn: 1,
              },
            ],
            sourceFile: '/test.ts',
            sourceLine: 1,
            sourceColumn: 1,
          },
        ],
        exports: [],
        sourceFile: '/test.ts',
        sourceLine: 1,
        sourceColumn: 1,
      });

      injectEntityRoutes(ir);
      const diagnostics = detectRouteCollisions(ir);

      expect(diagnostics.some((d) => d.code === 'ENTITY_ROUTE_COLLISION')).toBe(true);
    });
  });
});
