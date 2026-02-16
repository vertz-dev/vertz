import { writeFile } from 'node:fs/promises';
import { BaseGenerator } from './base-generator';

function groupImportsByModule(imports) {
  const groups = new Map();
  for (const imp of imports) {
    if (!imp.sourceModule) continue;
    const existing = groups.get(imp.sourceModule) ?? [];
    existing.push(imp.localName);
    groups.set(imp.sourceModule, existing);
  }
  return Array.from(groups.entries()).map(([from, items]) => ({ from, items }));
}
function resolveSchemaRef(ref) {
  if (!ref) return undefined;
  if (ref.kind === 'named') return { $ref: `#/schemas/${ref.schemaName}` };
  return ref.jsonSchema;
}
export function buildManifest(ir) {
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
      ir.schemas.filter((s) => s.isNamed && s.jsonSchema).map((s) => [s.name, s.jsonSchema]),
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
  name = 'manifest';
  async generate(ir, outputDir) {
    const manifest = buildManifest(ir);
    const content = JSON.stringify(manifest, null, 2);
    const outputPath = this.resolveOutputPath(outputDir, 'manifest.json');
    await writeFile(outputPath, content);
  }
}
//# sourceMappingURL=manifest-generator.js.map
