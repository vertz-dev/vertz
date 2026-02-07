import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppIR, MiddlewareIR, RouteIR, SchemaIR, SchemaRef } from '../../ir/types';
import type { JSONSchemaObject, OpenAPIParameter } from '../openapi-generator';
import { OpenAPIGenerator } from '../openapi-generator';

function createGenerator(configOverrides?: Parameters<typeof resolveConfig>[0]) {
  return new OpenAPIGenerator(resolveConfig(configOverrides));
}

function createMinimalIR(overrides?: Partial<AppIR>): AppIR {
  return {
    ...createEmptyAppIR(),
    app: {
      basePath: '/api',
      globalMiddleware: [],
      moduleRegistrations: [],
      sourceFile: 'src/app.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
    ...overrides,
  };
}

function makeRoute(
  overrides: Partial<RouteIR> & { method: RouteIR['method']; fullPath: string },
): RouteIR {
  return {
    sourceFile: 'src/routes.ts',
    sourceLine: 1,
    sourceColumn: 1,
    path: overrides.fullPath,
    operationId: `test_${overrides.method.toLowerCase()}`,
    middleware: [],
    tags: [],
    ...overrides,
  };
}

function makeSchema(overrides: Partial<SchemaIR> & { name: string }): SchemaIR {
  return {
    sourceFile: 'src/schemas/test.schema.ts',
    sourceLine: 1,
    sourceColumn: 1,
    namingConvention: {},
    isNamed: true,
    ...overrides,
  };
}

function makeMiddleware(overrides: Partial<MiddlewareIR> & { name: string }): MiddlewareIR {
  return {
    sourceFile: 'src/middleware.ts',
    sourceLine: 1,
    sourceColumn: 1,
    inject: [],
    ...overrides,
  };
}

function irWithRoutes(routes: RouteIR[], extras?: Partial<AppIR>): AppIR {
  return createMinimalIR({
    modules: [
      {
        name: 'testModule',
        imports: [],
        services: [],
        routers: [
          {
            name: 'testRouter',
            moduleName: 'testModule',
            prefix: '',
            inject: [],
            routes,
            sourceFile: 'src/router.ts',
            sourceLine: 1,
            sourceColumn: 1,
          },
        ],
        exports: [],
        sourceFile: 'src/module.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ],
    ...extras,
  });
}

describe('OpenAPIGenerator', () => {
  describe('path and server tests', () => {
    it('converts basePath to server URL', () => {
      const gen = createGenerator();
      const ir = createMinimalIR({
        app: {
          ...createMinimalIR().app,
          basePath: '/api/v1',
        },
      });
      const doc = gen.buildDocument(ir);
      expect(doc.servers).toEqual([{ url: '/api/v1' }]);
    });

    it('sets info from config', () => {
      const gen = createGenerator({
        compiler: {
          openapi: {
            output: 'openapi.json',
            info: { title: 'My API', version: '1.0.0' },
          },
        },
      });
      const ir = createMinimalIR();
      const doc = gen.buildDocument(ir);
      expect(doc.info).toEqual({ title: 'My API', version: '1.0.0' });
    });

    it('sets info version from app.version when config omits it', () => {
      const gen = createGenerator();
      const ir = createMinimalIR({
        app: { ...createMinimalIR().app, version: 'v2' },
      });
      const doc = gen.buildDocument(ir);
      expect(doc.info.version).toBe('v2');
    });

    it('converts colon path params to curly bracket', () => {
      const gen = createGenerator();
      expect(gen.convertPath('/users/:id/posts/:postId')).toBe('/users/{id}/posts/{postId}');
    });

    it('handles root path', () => {
      const gen = createGenerator();
      expect(gen.convertPath('/')).toBe('/');
    });
  });

  describe('operation tests', () => {
    it('creates GET operation from route', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users/:id', operationId: 'user_getUserById' }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc.paths['/users/{id}']?.get?.operationId).toBe('user_getUserById');
    });

    it('creates POST operation with request body', () => {
      const gen = createGenerator();
      const bodySchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'POST', fullPath: '/users', body: bodySchema }),
      ]);
      const doc = gen.buildDocument(ir);
      const op = doc.paths['/users']?.post;
      expect(op?.requestBody?.content['application/json'].schema).toEqual({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
    });

    it('creates PUT operation', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([makeRoute({ method: 'PUT', fullPath: '/users/:id' })]);
      const doc = gen.buildDocument(ir);
      expect(doc.paths['/users/{id}']?.put).toBeDefined();
    });

    it('creates DELETE operation with 204 response', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([makeRoute({ method: 'DELETE', fullPath: '/users/:id' })]);
      const doc = gen.buildDocument(ir);
      const op = doc.paths['/users/{id}']?.delete;
      expect(op?.responses['204']).toEqual({ description: 'No Content' });
    });

    it('creates PATCH operation with request body', () => {
      const gen = createGenerator();
      const bodySchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'PATCH', fullPath: '/users/:id', body: bodySchema }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc.paths['/users/{id}']?.patch?.requestBody).toBeDefined();
    });

    it('sets operation description from route', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users/:id', description: 'Get user by ID' }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc.paths['/users/{id}']?.get?.description).toBe('Get user by ID');
    });

    it('sets operation tags from route', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users', tags: ['users', 'admin'] }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc.paths['/users']?.get?.tags).toEqual(['users', 'admin']);
    });

    it('multiple routes on same path produce multiple operations', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users', operationId: 'listUsers' }),
        makeRoute({ method: 'POST', fullPath: '/users', operationId: 'createUser' }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc.paths['/users']?.get?.operationId).toBe('listUsers');
      expect(doc.paths['/users']?.post?.operationId).toBe('createUser');
    });
  });

  describe('parameter tests', () => {
    it('generates path parameters from params schema', () => {
      const gen = createGenerator();
      const paramsSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users/:id', params: paramsSchema }),
      ]);
      const doc = gen.buildDocument(ir);
      const params = doc.paths['/users/{id}']?.get?.parameters;
      expect(params).toContainEqual({
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      });
    });

    it('path parameters are always required', () => {
      const gen = createGenerator();
      const paramsSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string' } },
          // no required array
        },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users/:id', params: paramsSchema }),
      ]);
      const doc = gen.buildDocument(ir);
      const params = doc.paths['/users/{id}']?.get?.parameters;
      expect(params?.find((p) => p.name === 'id')?.required).toBe(true);
    });

    it('generates query parameters from query schema', () => {
      const gen = createGenerator();
      const querySchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users', query: querySchema }),
      ]);
      const doc = gen.buildDocument(ir);
      const params = doc.paths['/users']?.get?.parameters;
      expect(params).toContainEqual({
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer' },
      });
      expect(params).toContainEqual({
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer' },
      });
    });

    it('query parameters respect required array', () => {
      const gen = createGenerator();
      const querySchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
          required: ['page'],
        },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users', query: querySchema }),
      ]);
      const doc = gen.buildDocument(ir);
      const params = doc.paths['/users']?.get?.parameters;
      expect(params?.find((p) => p.name === 'page')?.required).toBe(true);
      expect(params?.find((p) => p.name === 'limit')?.required).toBe(false);
    });

    it('generates header parameters from route headers schema', () => {
      const gen = createGenerator();
      const headersSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: { 'x-api-key': { type: 'string' } },
          required: ['x-api-key'],
        },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users', headers: headersSchema }),
      ]);
      const doc = gen.buildDocument(ir);
      const params = doc.paths['/users']?.get?.parameters;
      expect(params).toContainEqual({
        name: 'x-api-key',
        in: 'header',
        required: true,
        schema: { type: 'string' },
      });
    });

    it('generates header parameters from middleware headers', () => {
      const gen = createGenerator();
      const authMw = makeMiddleware({
        name: 'authMiddleware',
        headers: {
          kind: 'inline',
          sourceFile: 'src/middleware.ts',
          jsonSchema: {
            type: 'object',
            properties: { authorization: { type: 'string' } },
            required: ['authorization'],
          },
        },
      });
      const ir = irWithRoutes(
        [
          makeRoute({
            method: 'GET',
            fullPath: '/users',
            middleware: [{ name: 'authMiddleware', sourceFile: 'src/middleware.ts' }],
          }),
        ],
        { middleware: [authMw] },
      );
      const doc = gen.buildDocument(ir);
      const params = doc.paths['/users']?.get?.parameters;
      expect(params).toContainEqual({
        name: 'authorization',
        in: 'header',
        required: true,
        schema: { type: 'string' },
      });
    });

    it('deduplicates header parameters from route and middleware', () => {
      const gen = createGenerator();
      const authMw = makeMiddleware({
        name: 'authMiddleware',
        headers: {
          kind: 'inline',
          sourceFile: 'src/middleware.ts',
          jsonSchema: {
            type: 'object',
            properties: { authorization: { type: 'string' } },
            required: ['authorization'],
          },
        },
      });
      const routeHeaders: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: { authorization: { type: 'string', format: 'bearer' } },
          required: ['authorization'],
        },
      };
      const ir = irWithRoutes(
        [
          makeRoute({
            method: 'GET',
            fullPath: '/users',
            headers: routeHeaders,
            middleware: [{ name: 'authMiddleware', sourceFile: 'src/middleware.ts' }],
          }),
        ],
        { middleware: [authMw] },
      );
      const doc = gen.buildDocument(ir);
      const params = doc.paths['/users']?.get?.parameters;
      const authParams = params?.filter((p) => p.name === 'authorization');
      expect(authParams).toHaveLength(1);
      // Route-level wins (last-write-wins)
      expect(authParams?.[0]?.schema).toEqual({ type: 'string', format: 'bearer' });
    });

    it('middleware headers from multiple middlewares merge', () => {
      const gen = createGenerator();
      const mw1 = makeMiddleware({
        name: 'mw1',
        headers: {
          kind: 'inline',
          sourceFile: 'src/middleware.ts',
          jsonSchema: {
            type: 'object',
            properties: { 'x-request-id': { type: 'string' } },
            required: ['x-request-id'],
          },
        },
      });
      const mw2 = makeMiddleware({
        name: 'mw2',
        headers: {
          kind: 'inline',
          sourceFile: 'src/middleware.ts',
          jsonSchema: {
            type: 'object',
            properties: { 'x-trace-id': { type: 'string' } },
            required: ['x-trace-id'],
          },
        },
      });
      const ir = irWithRoutes(
        [
          makeRoute({
            method: 'GET',
            fullPath: '/users',
            middleware: [
              { name: 'mw1', sourceFile: 'src/middleware.ts' },
              { name: 'mw2', sourceFile: 'src/middleware.ts' },
            ],
          }),
        ],
        { middleware: [mw1, mw2] },
      );
      const doc = gen.buildDocument(ir);
      const params = doc.paths['/users']?.get?.parameters;
      expect(params?.some((p) => p.name === 'x-request-id')).toBe(true);
      expect(params?.some((p) => p.name === 'x-trace-id')).toBe(true);
    });
  });

  describe('schema resolution tests', () => {
    it('inline schema ref resolves to inline JSON Schema', () => {
      const gen = createGenerator();
      const ref: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'string' },
      };
      const result = gen.resolveSchemaRef(ref);
      expect(result).toEqual({ type: 'string' });
    });

    it('named schema ref resolves to $ref', () => {
      const gen = createGenerator();
      const ref: SchemaRef = {
        kind: 'named',
        schemaName: 'CreateUserBody',
        sourceFile: 'src/schemas/test.ts',
      };
      const result = gen.resolveSchemaRef(ref);
      expect(result).toEqual({ $ref: '#/components/schemas/CreateUserBody' });
    });

    it('named schemas appear in components/schemas', () => {
      const gen = createGenerator();
      const userSchema = makeSchema({
        name: 'CreateUserBody',
        id: 'CreateUserBody',
        jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
      });
      const ir = createMinimalIR({ schemas: [userSchema] });
      const doc = gen.buildDocument(ir);
      expect(doc.components.schemas.CreateUserBody).toEqual({
        type: 'object',
        properties: { name: { type: 'string' } },
      });
    });

    it('unnamed schemas are not in components/schemas', () => {
      const gen = createGenerator();
      const inlineSchema = makeSchema({
        name: 'inlineStuff',
        isNamed: false,
        jsonSchema: { type: 'string' },
      });
      const ir = createMinimalIR({ schemas: [inlineSchema] });
      const doc = gen.buildDocument(ir);
      expect(Object.keys(doc.components.schemas)).toHaveLength(0);
    });
  });

  describe('$defs lifting tests', () => {
    it('lifts $defs from schema to components/schemas', () => {
      const gen = createGenerator();
      const components: Record<string, JSONSchemaObject> = {};
      const schema: JSONSchemaObject = {
        type: 'object',
        properties: {
          address: { $ref: '#/$defs/Address' },
        },
        $defs: {
          Address: { type: 'object', properties: { street: { type: 'string' } } },
        },
      };
      const result = gen.liftDefsToComponents(schema, components);
      expect(components.Address).toEqual({
        type: 'object',
        properties: { street: { type: 'string' } },
      });
      expect(result.$defs).toBeUndefined();
    });

    it('rewrites local $ref pointers to component refs', () => {
      const gen = createGenerator();
      const components: Record<string, JSONSchemaObject> = {};
      const schema: JSONSchemaObject = {
        type: 'object',
        properties: {
          address: { $ref: '#/$defs/Address' },
        },
        $defs: {
          Address: { type: 'object', properties: { street: { type: 'string' } } },
        },
      };
      const result = gen.liftDefsToComponents(schema, components);
      expect(result.properties?.address.$ref).toBe('#/components/schemas/Address');
    });

    it('nested $defs are lifted recursively', () => {
      const gen = createGenerator();
      const components: Record<string, JSONSchemaObject> = {};
      const schema: JSONSchemaObject = {
        type: 'object',
        $defs: {
          Inner: {
            type: 'object',
            $defs: {
              Deeper: { type: 'string' },
            },
            properties: {
              value: { $ref: '#/$defs/Deeper' },
            },
          },
        },
        properties: {
          inner: { $ref: '#/$defs/Inner' },
        },
      };
      const result = gen.liftDefsToComponents(schema, components);
      expect(components.Inner).toBeDefined();
      expect(components.Deeper).toBeDefined();
      expect(result.$defs).toBeUndefined();
    });

    it('conflicting $defs names are deduplicated', () => {
      const gen = createGenerator();
      const components: Record<string, JSONSchemaObject> = {};
      // First schema defines Address
      gen.liftDefsToComponents(
        {
          type: 'object',
          $defs: {
            Address: { type: 'object', properties: { street: { type: 'string' } } },
          },
        },
        components,
      );
      // Second schema defines Address with different content
      gen.liftDefsToComponents(
        {
          type: 'object',
          $defs: {
            Address: { type: 'object', properties: { city: { type: 'string' } } },
          },
        },
        components,
      );
      expect(components.Address).toBeDefined();
      expect(components.Address_2).toBeDefined();
    });
  });

  describe('response tests', () => {
    it('generates 200 response with schema for GET', () => {
      const gen = createGenerator();
      const responseSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users/:id', response: responseSchema }),
      ]);
      const doc = gen.buildDocument(ir);
      const resp = doc.paths['/users/{id}']?.get?.responses['200'];
      expect(resp?.content?.['application/json'].schema).toEqual({
        type: 'object',
        properties: { id: { type: 'string' } },
      });
    });

    it('generates 201 response for POST', () => {
      const gen = createGenerator();
      const responseSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'POST', fullPath: '/users', response: responseSchema }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc.paths['/users']?.post?.responses['201']).toBeDefined();
    });

    it('generates 204 response with no content for DELETE without response schema', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([makeRoute({ method: 'DELETE', fullPath: '/users/:id' })]);
      const doc = gen.buildDocument(ir);
      const resp = doc.paths['/users/{id}']?.delete?.responses['204'];
      expect(resp).toEqual({ description: 'No Content' });
      expect(resp?.content).toBeUndefined();
    });

    it('generates 200 response for PUT/PATCH with response schema', () => {
      const gen = createGenerator();
      const responseSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'object' },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'PUT', fullPath: '/users/:id', response: responseSchema }),
        makeRoute({ method: 'PATCH', fullPath: '/posts/:id', response: responseSchema }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc.paths['/users/{id}']?.put?.responses['200']).toBeDefined();
      expect(doc.paths['/posts/{id}']?.patch?.responses['200']).toBeDefined();
    });

    it('response uses $ref for named schemas', () => {
      const gen = createGenerator();
      const userSchema = makeSchema({
        name: 'ReadUserResponse',
        id: 'ReadUserResponse',
        jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
      });
      const responseRef: SchemaRef = {
        kind: 'named',
        schemaName: 'ReadUserResponse',
        sourceFile: 'src/schemas/test.ts',
      };
      const ir = irWithRoutes(
        [makeRoute({ method: 'GET', fullPath: '/users/:id', response: responseRef })],
        { schemas: [userSchema] },
      );
      const doc = gen.buildDocument(ir);
      const resp = doc.paths['/users/{id}']?.get?.responses['200'];
      expect(resp?.content?.['application/json'].schema).toEqual({
        $ref: '#/components/schemas/ReadUserResponse',
      });
    });
  });

  describe('discriminated union tests', () => {
    it('discriminatedUnion maps to oneOf + discriminator', () => {
      const gen = createGenerator();
      const responseSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          oneOf: [
            {
              type: 'object',
              properties: { type: { const: 'success' }, data: { type: 'object' } },
            },
            {
              type: 'object',
              properties: { type: { const: 'error' }, message: { type: 'string' } },
            },
          ],
          discriminator: { propertyName: 'type' },
        },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/result', response: responseSchema }),
      ]);
      const doc = gen.buildDocument(ir);
      const schema =
        doc.paths['/result']?.get?.responses['200']?.content?.['application/json'].schema;
      expect(schema?.oneOf).toHaveLength(2);
      expect(schema?.discriminator?.propertyName).toBe('type');
    });

    it('discriminatedUnion variants with named schemas use $ref in oneOf', () => {
      const gen = createGenerator();
      const successSchema = makeSchema({
        name: 'SuccessResponse',
        id: 'SuccessResponse',
        jsonSchema: { type: 'object', properties: { type: { const: 'success' } } },
      });
      const errorSchema = makeSchema({
        name: 'ErrorResponse',
        id: 'ErrorResponse',
        jsonSchema: { type: 'object', properties: { type: { const: 'error' } } },
      });
      const responseRef: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          oneOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            { $ref: '#/components/schemas/ErrorResponse' },
          ],
          discriminator: { propertyName: 'type' },
        },
      };
      const ir = irWithRoutes(
        [makeRoute({ method: 'GET', fullPath: '/result', response: responseRef })],
        { schemas: [successSchema, errorSchema] },
      );
      const doc = gen.buildDocument(ir);
      const schema =
        doc.paths['/result']?.get?.responses['200']?.content?.['application/json'].schema;
      expect(schema?.oneOf?.[0]).toEqual({ $ref: '#/components/schemas/SuccessResponse' });
      expect(schema?.oneOf?.[1]).toEqual({ $ref: '#/components/schemas/ErrorResponse' });
    });
  });

  describe('tags tests', () => {
    it('collects unique tags from all routes', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users', tags: ['users'] }),
        makeRoute({ method: 'GET', fullPath: '/admin', tags: ['users', 'admin'] }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc.tags).toEqual([{ name: 'admin' }, { name: 'users' }]);
    });

    it('empty tags array when no routes have tags', () => {
      const gen = createGenerator();
      const ir = irWithRoutes([makeRoute({ method: 'GET', fullPath: '/users', tags: [] })]);
      const doc = gen.buildDocument(ir);
      expect(doc.tags).toEqual([]);
    });
  });

  describe('$defs integration in buildDocument', () => {
    it('lifts $defs from inline response schema to components/schemas during buildDocument', () => {
      const gen = createGenerator();
      const responseSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: {
            address: { $ref: '#/$defs/Address' },
          },
          $defs: {
            Address: { type: 'object', properties: { street: { type: 'string' } } },
          },
        },
      };
      const ir = irWithRoutes([
        makeRoute({ method: 'GET', fullPath: '/users/:id', response: responseSchema }),
      ]);
      const doc = gen.buildDocument(ir);
      // $defs should be lifted to components/schemas
      expect(doc.components.schemas.Address).toEqual({
        type: 'object',
        properties: { street: { type: 'string' } },
      });
      // $ref should be rewritten in the response
      const respSchema =
        doc.paths['/users/{id}']?.get?.responses['200']?.content?.['application/json'].schema;
      expect(respSchema?.properties?.address?.$ref).toBe('#/components/schemas/Address');
      expect(respSchema?.$defs).toBeUndefined();
    });
  });

  describe('edge case tests', () => {
    it('empty IR produces minimal valid OpenAPI doc', () => {
      const gen = createGenerator();
      const ir = createMinimalIR();
      const doc = gen.buildDocument(ir);
      expect(doc.openapi).toBe('3.1.0');
      expect(doc.paths).toEqual({});
      expect(doc.components.schemas).toEqual({});
      expect(doc.tags).toEqual([]);
    });

    it('route with all schema types populated', () => {
      const gen = createGenerator();
      const paramsSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      };
      const querySchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'object', properties: { include: { type: 'string' } } },
      };
      const headersSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: { 'x-api-key': { type: 'string' } },
          required: ['x-api-key'],
        },
      };
      const bodySchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: { type: 'object', properties: { name: { type: 'string' } } },
      };
      const responseSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, name: { type: 'string' } },
        },
      };
      const ir = irWithRoutes([
        makeRoute({
          method: 'PUT',
          fullPath: '/users/:id',
          params: paramsSchema,
          query: querySchema,
          headers: headersSchema,
          body: bodySchema,
          response: responseSchema,
          tags: ['users'],
          description: 'Update a user',
        }),
      ]);
      const doc = gen.buildDocument(ir);
      const op = doc.paths['/users/{id}']?.put;
      expect(op).toBeDefined();
      expect(op?.parameters.some((p) => p.in === 'path')).toBe(true);
      expect(op?.parameters.some((p) => p.in === 'query')).toBe(true);
      expect(op?.parameters.some((p) => p.in === 'header')).toBe(true);
      expect(op?.requestBody).toBeDefined();
      expect(op?.responses['200']).toBeDefined();
      expect(op?.tags).toEqual(['users']);
      expect(op?.description).toBe('Update a user');
    });
  });

  describe('snapshot tests', () => {
    it('snapshot: minimal single-route API', () => {
      const gen = createGenerator({
        compiler: {
          openapi: { output: 'openapi.json', info: { title: 'Test API', version: '1.0.0' } },
        },
      });
      const paramsSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      };
      const responseSchema: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, name: { type: 'string' } },
        },
      };
      const ir = irWithRoutes([
        makeRoute({
          method: 'GET',
          fullPath: '/users/:id',
          operationId: 'user_getById',
          params: paramsSchema,
          response: responseSchema,
          tags: ['users'],
        }),
      ]);
      const doc = gen.buildDocument(ir);
      expect(doc).toMatchSnapshot();
    });

    it('snapshot: multi-module CRUD API', () => {
      const gen = createGenerator({
        compiler: {
          openapi: { output: 'openapi.json', info: { title: 'CRUD API', version: '2.0.0' } },
        },
      });
      const userBodySchema = makeSchema({
        name: 'CreateUserBody',
        id: 'CreateUserBody',
        jsonSchema: {
          type: 'object',
          properties: { name: { type: 'string' }, email: { type: 'string' } },
          required: ['name', 'email'],
        },
      });
      const userResponseSchema = makeSchema({
        name: 'ReadUserResponse',
        id: 'ReadUserResponse',
        jsonSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, name: { type: 'string' } },
        },
      });
      const ir = createMinimalIR({
        schemas: [userBodySchema, userResponseSchema],
        modules: [
          {
            name: 'users',
            imports: [],
            services: [],
            exports: [],
            sourceFile: 'src/modules/users.ts',
            sourceLine: 1,
            sourceColumn: 1,
            routers: [
              {
                name: 'userRouter',
                moduleName: 'users',
                prefix: '/users',
                inject: [],
                sourceFile: 'src/routers/user.ts',
                sourceLine: 1,
                sourceColumn: 1,
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users',
                    operationId: 'user_list',
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'src/schemas/user.ts',
                    },
                    tags: ['users'],
                  }),
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id',
                    operationId: 'user_getById',
                    params: {
                      kind: 'inline',
                      sourceFile: 'src/schemas/test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id'],
                      },
                    },
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'src/schemas/user.ts',
                    },
                    tags: ['users'],
                  }),
                  makeRoute({
                    method: 'POST',
                    fullPath: '/users',
                    operationId: 'user_create',
                    body: {
                      kind: 'named',
                      schemaName: 'CreateUserBody',
                      sourceFile: 'src/schemas/user.ts',
                    },
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'src/schemas/user.ts',
                    },
                    tags: ['users'],
                  }),
                  makeRoute({
                    method: 'PUT',
                    fullPath: '/users/:id',
                    operationId: 'user_update',
                    params: {
                      kind: 'inline',
                      sourceFile: 'src/schemas/test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id'],
                      },
                    },
                    body: {
                      kind: 'named',
                      schemaName: 'CreateUserBody',
                      sourceFile: 'src/schemas/user.ts',
                    },
                    response: {
                      kind: 'named',
                      schemaName: 'ReadUserResponse',
                      sourceFile: 'src/schemas/user.ts',
                    },
                    tags: ['users'],
                  }),
                  makeRoute({
                    method: 'DELETE',
                    fullPath: '/users/:id',
                    operationId: 'user_delete',
                    params: {
                      kind: 'inline',
                      sourceFile: 'src/schemas/test.ts',
                      jsonSchema: {
                        type: 'object',
                        properties: { id: { type: 'string' } },
                        required: ['id'],
                      },
                    },
                    tags: ['users'],
                  }),
                ],
              },
            ],
          },
        ],
      });
      const doc = gen.buildDocument(ir);
      expect(doc).toMatchSnapshot();
    });

    it('snapshot: middleware headers in spec', () => {
      const gen = createGenerator({
        compiler: {
          openapi: { output: 'openapi.json', info: { title: 'Auth API', version: '1.0.0' } },
        },
      });
      const authMw = makeMiddleware({
        name: 'auth',
        headers: {
          kind: 'inline',
          sourceFile: 'src/middleware.ts',
          jsonSchema: {
            type: 'object',
            properties: { authorization: { type: 'string' } },
            required: ['authorization'],
          },
        },
      });
      const corsMw = makeMiddleware({
        name: 'cors',
        headers: {
          kind: 'inline',
          sourceFile: 'src/middleware.ts',
          jsonSchema: {
            type: 'object',
            properties: { 'x-request-id': { type: 'string' } },
            required: ['x-request-id'],
          },
        },
      });
      const ir = irWithRoutes(
        [
          makeRoute({
            method: 'GET',
            fullPath: '/users',
            operationId: 'user_list',
            middleware: [
              { name: 'auth', sourceFile: 'src/middleware.ts' },
              { name: 'cors', sourceFile: 'src/middleware.ts' },
            ],
            tags: ['users'],
          }),
        ],
        { middleware: [authMw, corsMw] },
      );
      const doc = gen.buildDocument(ir);
      expect(doc).toMatchSnapshot();
    });

    it('snapshot: discriminated union response', () => {
      const gen = createGenerator({
        compiler: {
          openapi: { output: 'openapi.json', info: { title: 'Union API', version: '1.0.0' } },
        },
      });
      const successSchema = makeSchema({
        name: 'SuccessResponse',
        id: 'SuccessResponse',
        jsonSchema: {
          type: 'object',
          properties: { status: { const: 'success' }, data: { type: 'object' } },
          required: ['status'],
        },
      });
      const errorSchema = makeSchema({
        name: 'ErrorResponse',
        id: 'ErrorResponse',
        jsonSchema: {
          type: 'object',
          properties: { status: { const: 'error' }, message: { type: 'string' } },
          required: ['status'],
        },
      });
      const responseRef: SchemaRef = {
        kind: 'inline',
        sourceFile: 'src/schemas/test.ts',
        jsonSchema: {
          oneOf: [
            { $ref: '#/components/schemas/SuccessResponse' },
            { $ref: '#/components/schemas/ErrorResponse' },
          ],
          discriminator: { propertyName: 'status' },
        },
      };
      const ir = irWithRoutes(
        [
          makeRoute({
            method: 'GET',
            fullPath: '/result',
            operationId: 'getResult',
            response: responseRef,
            tags: ['results'],
          }),
        ],
        { schemas: [successSchema, errorSchema] },
      );
      const doc = gen.buildDocument(ir);
      expect(doc).toMatchSnapshot();
    });
  });

  describe('file output tests', () => {
    it('writes openapi.json to output directory', async () => {
      const gen = createGenerator();
      const ir = createMinimalIR();
      const tmpDir = mkdtempSync(join(tmpdir(), 'openapi-test-'));
      await gen.generate(ir, tmpDir);
      expect(existsSync(join(tmpDir, 'openapi.json'))).toBe(true);
    });

    it('output is valid JSON', async () => {
      const gen = createGenerator();
      const ir = createMinimalIR();
      const tmpDir = mkdtempSync(join(tmpdir(), 'openapi-test-'));
      await gen.generate(ir, tmpDir);
      const content = readFileSync(join(tmpDir, 'openapi.json'), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('output openapi field is 3.1.0', async () => {
      const gen = createGenerator();
      const ir = createMinimalIR();
      const tmpDir = mkdtempSync(join(tmpdir(), 'openapi-test-'));
      await gen.generate(ir, tmpDir);
      const content = readFileSync(join(tmpDir, 'openapi.json'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.openapi).toBe('3.1.0');
    });
  });

  describe('type-level tests', () => {
    it('OpenAPIGenerator requires ResolvedConfig in constructor', () => {
      // @ts-expect-error — constructor requires ResolvedConfig
      new OpenAPIGenerator();
    });

    it('JSONSchemaObject.$ref must be string, not number', () => {
      // @ts-expect-error — $ref must be string, not number
      const _bad: JSONSchemaObject = { $ref: 42 };
    });

    it('OpenAPIParameter.in only accepts path | query | header', () => {
      // @ts-expect-error — 'cookie' is not assignable to 'path' | 'query' | 'header'
      const _bad: OpenAPIParameter = { name: 'test', in: 'cookie', required: false, schema: {} };
    });
  });
});
