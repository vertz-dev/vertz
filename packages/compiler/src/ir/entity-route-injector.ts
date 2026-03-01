import type { Diagnostic } from '../errors';
import type {
  AppIR,
  EntityIR,
  HttpMethod,
  InlineSchemaRef,
  ModuleIR,
  RouteIR,
  RouterIR,
  SchemaRef,
  SourceLocation,
} from './types';

const SYNTHETIC_MODULE = '__entities';

function toPascalCase(s: string): string {
  return s
    .split('-')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join('');
}

export function injectEntityRoutes(ir: AppIR): void {
  if (!ir.entities.length) return;

  const routes: RouteIR[] = [];
  for (const entity of ir.entities) {
    routes.push(...generateCrudRoutes(entity));
    routes.push(...generateActionRoutes(entity));
  }

  if (!routes.length) return;

  // Create synthetic module with single router
  const router: RouterIR = {
    name: `${SYNTHETIC_MODULE}_router`,
    moduleName: SYNTHETIC_MODULE,
    prefix: '',
    inject: [],
    routes,
    sourceFile: '',
    sourceLine: 0,
    sourceColumn: 0,
  };

  const module: ModuleIR = {
    name: SYNTHETIC_MODULE,
    imports: [],
    services: [],
    routers: [router],
    exports: [],
    sourceFile: '',
    sourceLine: 0,
    sourceColumn: 0,
  };

  ir.modules.push(module);
}

function generateCrudRoutes(entity: EntityIR): RouteIR[] {
  const entityPascal = toPascalCase(entity.name);
  const basePath = `/${entity.name}`;
  const routes: RouteIR[] = [];

  const ops: { op: string; method: HttpMethod; path: string; idParam: boolean }[] = [
    { op: 'list', method: 'GET', path: basePath, idParam: false },
    { op: 'get', method: 'GET', path: `${basePath}/:id`, idParam: true },
    { op: 'create', method: 'POST', path: basePath, idParam: false },
    { op: 'update', method: 'PATCH', path: `${basePath}/:id`, idParam: true },
    { op: 'delete', method: 'DELETE', path: `${basePath}/:id`, idParam: true },
  ];

  for (const { op, method, path } of ops) {
    const accessKind = entity.access[op as keyof typeof entity.access];
    if (accessKind === 'false') continue;

    const route: RouteIR = {
      method,
      path,
      fullPath: path,
      operationId: `${op}${entityPascal}`,
      middleware: [],
      tags: [entity.name],
      description: `${op} ${entity.name}`,
      ...entity, // source location
    };

    // Add schema refs when model is resolved
    if (entity.modelRef.schemaRefs.resolved) {
      if (op === 'create') {
        route.body = entity.modelRef.schemaRefs.createInput;
        route.response = entity.modelRef.schemaRefs.response;
      } else if (op === 'update') {
        route.body = entity.modelRef.schemaRefs.updateInput;
        route.response = entity.modelRef.schemaRefs.response;
      } else if (op === 'list') {
        route.response = wrapInPaginatedEnvelope(entity.modelRef.schemaRefs.response);
      } else {
        route.response = entity.modelRef.schemaRefs.response;
      }
    }

    routes.push(route);
  }

  return routes;
}

function wrapInPaginatedEnvelope(itemSchema: SchemaRef | undefined): InlineSchemaRef | undefined {
  if (!itemSchema) return undefined;

  const itemJsonSchema =
    itemSchema.kind === 'named'
      ? { $ref: `#/components/schemas/${itemSchema.schemaName}` }
      : (itemSchema.jsonSchema ?? {});

  return {
    kind: 'inline',
    sourceFile: itemSchema.sourceFile,
    jsonSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: itemJsonSchema },
        total: { type: 'number' },
        limit: { type: 'number' },
        nextCursor: { type: ['string', 'null'] },
        hasNextPage: { type: 'boolean' },
      },
      required: ['items', 'total', 'limit', 'nextCursor', 'hasNextPage'],
    },
  };
}

function generateActionRoutes(entity: EntityIR): RouteIR[] {
  const entityPascal = toPascalCase(entity.name);

  return entity.actions
    .filter((action) => entity.access.custom[action.name] !== 'false')
    .map((action) => {
      const method = action.method;
      const path = action.path
        ? `/${entity.name}/${action.path}`
        : `/${entity.name}/:id/${action.name}`;
      const fullPath = path;

      return {
        method,
        path,
        fullPath,
        operationId: `${action.name}${entityPascal}`,
        params: action.params,
        query: action.query,
        headers: action.headers,
        body: action.body,
        response: action.response,
        middleware: [],
        tags: [entity.name],
        description: `${action.name} on ${entity.name}`,
        sourceFile: action.sourceFile,
        sourceLine: action.sourceLine,
        sourceColumn: action.sourceColumn,
      };
    });
}

export function detectRouteCollisions(ir: AppIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, SourceLocation>();

  // Collect all operationIds from module routes
  for (const mod of ir.modules) {
    if (mod.name === SYNTHETIC_MODULE) continue;
    for (const router of mod.routers) {
      for (const route of router.routes) {
        seen.set(route.operationId, route);
      }
    }
  }

  // Check entity routes for collisions
  const entityModule = ir.modules.find((m) => m.name === SYNTHETIC_MODULE);
  if (entityModule) {
    for (const router of entityModule.routers) {
      for (const route of router.routes) {
        const existing = seen.get(route.operationId);
        if (existing) {
          diagnostics.push({
            code: 'ENTITY_ROUTE_COLLISION',
            severity: 'error',
            message: `Entity-generated operationId "${route.operationId}" collides with existing route at ${existing.sourceFile}:${existing.sourceLine}`,
            ...route,
          });
        }
        seen.set(route.operationId, route);
      }
    }
  }

  return diagnostics;
}
