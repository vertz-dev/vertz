import { writeFile } from 'node:fs/promises';
import type { AppIR, DependencyEdgeKind, HttpMethod, ImportRef, SchemaRef } from '../ir/types';
import { BaseGenerator } from './base-generator';

export interface ManifestModule {
  name: string;
  services: string[];
  routers: string[];
  exports: string[];
  imports: { from: string; items: string[] }[];
}

export interface ManifestRoute {
  method: HttpMethod;
  path: string;
  operationId: string;
  module: string;
  router: string;
  middleware: string[];
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  response?: Record<string, unknown>;
}

export interface ManifestMiddleware {
  name: string;
  provides?: Record<string, unknown>;
  requires?: Record<string, unknown>;
}

export interface ManifestDependencyEdge {
  from: string;
  to: string;
  type: DependencyEdgeKind;
}

export interface ManifestDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface AppManifest {
  version: string;
  app: {
    basePath: string;
    version?: string;
  };
  modules: ManifestModule[];
  routes: ManifestRoute[];
  schemas: Record<string, Record<string, unknown>>;
  middleware: ManifestMiddleware[];
  dependencyGraph: {
    initializationOrder: string[];
    edges: ManifestDependencyEdge[];
  };
  diagnostics: {
    errors: number;
    warnings: number;
    items: ManifestDiagnostic[];
  };
}

function groupImportsByModule(imports: ImportRef[]): { from: string; items: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const imp of imports) {
    if (!imp.sourceModule) continue;
    const existing = groups.get(imp.sourceModule) ?? [];
    existing.push(imp.localName);
    groups.set(imp.sourceModule, existing);
  }
  return Array.from(groups.entries()).map(([from, items]) => ({ from, items }));
}

function resolveSchemaRef(ref: SchemaRef | undefined): Record<string, unknown> | undefined {
  if (!ref) return undefined;
  if (ref.kind === 'named') return { $ref: `#/schemas/${ref.schemaName}` };
  return ref.jsonSchema;
}

export function buildManifest(ir: AppIR): AppManifest {
  return {
    version: '1.0.0',
    app: {
      basePath: ir.app.basePath,
      ...(ir.app.version && { version: ir.app.version }),
    },
    modules: ir.modules.map((mod) => ({
      name: mod.name,
      services: mod.services.map((s) => s.name),
      routers: mod.routers.map((r) => r.name),
      exports: mod.exports,
      imports: groupImportsByModule(mod.imports),
    })),
    routes: ir.modules.flatMap((mod) =>
      mod.routers.flatMap((router) =>
        router.routes.map((route) => {
          const params = resolveSchemaRef(route.params);
          const query = resolveSchemaRef(route.query);
          const body = resolveSchemaRef(route.body);
          const headers = resolveSchemaRef(route.headers);
          const response = resolveSchemaRef(route.response);
          return {
            method: route.method,
            path: route.fullPath,
            operationId: route.operationId,
            module: mod.name,
            router: router.name,
            middleware: route.middleware.map((m) => m.name),
            ...(params && { params }),
            ...(query && { query }),
            ...(body && { body }),
            ...(headers && { headers }),
            ...(response && { response }),
          };
        }),
      ),
    ),
    schemas: Object.fromEntries(
      ir.schemas
        .filter((s) => s.isNamed && s.jsonSchema)
        .map((s) => [s.name, s.jsonSchema as Record<string, unknown>]),
    ),
    middleware: ir.middleware.map((mw) => ({
      name: mw.name,
      ...(mw.provides?.jsonSchema && { provides: mw.provides.jsonSchema }),
      ...(mw.requires?.jsonSchema && { requires: mw.requires.jsonSchema }),
    })),
    dependencyGraph: {
      initializationOrder: ir.dependencyGraph.initializationOrder,
      edges: ir.dependencyGraph.edges.map((e) => ({
        from: e.from,
        to: e.to,
        type: e.kind,
      })),
    },
    diagnostics: {
      errors: ir.diagnostics.filter((d) => d.severity === 'error').length,
      warnings: ir.diagnostics.filter((d) => d.severity === 'warning').length,
      items: ir.diagnostics.map((d) => ({
        severity: d.severity,
        code: d.code,
        message: d.message,
        ...(d.file && { file: d.file }),
        ...(d.line && { line: d.line }),
        ...(d.suggestion && { suggestion: d.suggestion }),
      })),
    },
  };
}

export class ManifestGenerator extends BaseGenerator {
  readonly name = 'manifest';

  async generate(ir: AppIR, outputDir: string): Promise<void> {
    const manifest = buildManifest(ir);
    const content = JSON.stringify(manifest, null, 2);
    const outputPath = this.resolveOutputPath(outputDir, 'manifest.json');
    await writeFile(outputPath, content);
  }
}
