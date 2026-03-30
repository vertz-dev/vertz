/**
 * ManifestBuilder — maps EntityIR[] to DeploymentManifest
 *
 * Uses the compiler's EntityIR (static analysis output) to generate
 * a deployment manifest for Cloudflare Workers.
 */

import type { EntityIR } from '@vertz/compiler';
import type {
  BindingManifestEntry,
  DeploymentManifest,
  EntityManifestEntry,
  RouteManifestEntry,
} from './types';

const CRUD_OPERATIONS = ['list', 'get', 'create', 'update', 'delete'] as const;

const CRUD_ROUTES: Record<string, { method: string; pathSuffix: string }> = {
  list: { method: 'GET', pathSuffix: '' },
  get: { method: 'GET', pathSuffix: '/:id' },
  create: { method: 'POST', pathSuffix: '' },
  update: { method: 'PATCH', pathSuffix: '/:id' },
  delete: { method: 'DELETE', pathSuffix: '/:id' },
};

export class ManifestBuilder {
  constructor(private readonly entities: EntityIR[]) {}

  build(): DeploymentManifest {
    const entityEntries = this.entities.map((e) => this.buildEntityEntry(e));
    const routes = this.entities.flatMap((e) => this.buildRoutes(e));
    const bindings = this.buildBindings();

    return {
      version: 1,
      target: 'cloudflare',
      generatedAt: new Date().toISOString(),
      entities: entityEntries,
      routes,
      bindings,
      assets: { hasClient: false },
      ssr: { enabled: false },
    };
  }

  private buildEntityEntry(entity: EntityIR): EntityManifestEntry {
    const operations: string[] = [...CRUD_OPERATIONS];
    const accessRules: Record<string, { type: string }> = {};

    for (const op of CRUD_OPERATIONS) {
      accessRules[op] = { type: entity.access[op] };
    }

    for (const [actionName, ruleKind] of Object.entries(entity.access.custom)) {
      operations.push(actionName);
      accessRules[actionName] = { type: String(ruleKind) };
    }

    return {
      name: entity.name,
      table: entity.modelRef.tableName ?? entity.name,
      tenantScoped: entity.tenantScoped ?? false,
      operations,
      accessRules,
    };
  }

  private buildRoutes(entity: EntityIR): RouteManifestEntry[] {
    const routes: RouteManifestEntry[] = [];
    const basePath = `/api/${entity.name}`;

    for (const op of CRUD_OPERATIONS) {
      const route = CRUD_ROUTES[op]!;
      routes.push({
        method: route.method,
        path: `${basePath}${route.pathSuffix}`,
        entity: entity.name,
        operation: op,
      });
    }

    for (const action of entity.actions) {
      routes.push({
        method: action.method.toUpperCase(),
        path: action.path ? `${basePath}/${action.path}` : `${basePath}/${action.name}`,
        entity: entity.name,
        operation: action.name,
      });
    }

    return routes;
  }

  private buildBindings(): BindingManifestEntry[] {
    if (this.entities.length === 0) return [];

    return [
      {
        type: 'd1',
        name: 'DB',
        purpose: 'Primary database',
      },
    ];
  }
}
