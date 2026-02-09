import type { AppIR, SchemaRef } from '@vertz/compiler';
import type { CodegenIR, CodegenModule, CodegenSchema, OperationSchemaRefs } from './types';
import { toPascalCase } from './utils/naming';

export function adaptIR(appIR: AppIR): CodegenIR {
  // Step 2: Collect named schemas
  const rawSchemas = appIR.schemas.filter((s) => s.isNamed && s.jsonSchema);

  // Step 4: Detect collisions — same name from different modules
  const nameCount = new Map<string, number>();
  for (const s of rawSchemas) {
    nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1);
  }

  // Build rename map: moduleName:originalName -> resolvedName
  const renameMap = new Map<string, string>();
  const schemas: CodegenSchema[] = rawSchemas.map((s) => {
    const isCollision = (nameCount.get(s.name) ?? 0) > 1;
    const resolvedName = isCollision ? `${toPascalCase(s.moduleName)}${s.name}` : s.name;
    renameMap.set(`${s.moduleName}:${s.name}`, resolvedName);

    return {
      name: resolvedName,
      jsonSchema: s.jsonSchema as Record<string, unknown>,
      annotations: {
        namingParts: {
          operation: s.namingConvention.operation,
          entity: s.namingConvention.entity,
          part: s.namingConvention.part,
        },
      },
    };
  });

  // Step 1: Flatten module -> router -> route into module -> operation
  const modules: CodegenModule[] = appIR.modules.map((mod) => ({
    name: mod.name,
    operations: mod.routers.flatMap((router) =>
      router.routes.map((route) => {
        const resolveRef = (ref: SchemaRef | undefined): string | undefined => {
          if (!ref || ref.kind !== 'named') return undefined;
          return renameMap.get(`${mod.name}:${ref.schemaName}`) ?? ref.schemaName;
        };

        const schemaRefs: OperationSchemaRefs = {
          params: resolveRef(route.params),
          query: resolveRef(route.query),
          body: resolveRef(route.body),
          headers: resolveRef(route.headers),
          response: resolveRef(route.response),
        };

        return {
          operationId: route.operationId,
          method: route.method,
          path: route.fullPath,
          description: route.description,
          tags: route.tags,
          params: route.params?.jsonSchema,
          query: route.query?.jsonSchema,
          body: route.body?.jsonSchema,
          headers: route.headers?.jsonSchema,
          response: route.response?.jsonSchema,
          schemaRefs,
        };
      }),
    ),
  }));

  // Step 5: Name inline schemas (derive from operationId + slot)
  const slotNames: Record<string, string> = {
    params: 'Params',
    query: 'Query',
    body: 'Body',
    headers: 'Headers',
    response: 'Response',
  };

  const inlineSchemas: CodegenSchema[] = [];
  for (const mod of appIR.modules) {
    for (const router of mod.routers) {
      for (const route of router.routes) {
        for (const [slot, suffix] of Object.entries(slotNames)) {
          const ref = route[slot as keyof typeof route] as
            | { kind: string; jsonSchema?: Record<string, unknown> }
            | undefined;
          if (
            ref &&
            typeof ref === 'object' &&
            'kind' in ref &&
            ref.kind === 'inline' &&
            ref.jsonSchema
          ) {
            const name = `${toPascalCase(route.operationId)}${suffix}`;
            inlineSchemas.push({
              name,
              jsonSchema: ref.jsonSchema,
              annotations: { namingParts: {} },
            });
          }
        }
      }
    }
  }

  // Step 8: Sort deterministically
  const allSchemas = [...schemas, ...inlineSchemas].sort((a, b) => a.name.localeCompare(b.name));

  const sortedModules = modules
    .map((m) => ({
      ...m,
      operations: [...m.operations].sort((a, b) => a.operationId.localeCompare(b.operationId)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    basePath: appIR.app.basePath,
    version: appIR.app.version,
    modules: sortedModules,
    schemas: allSchemas,
    auth: { schemes: [] },
  };
}
