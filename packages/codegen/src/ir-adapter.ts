import type { AppIR, InlineSchemaRef } from '@vertz/compiler';
import type {
  CodegenEntityOperation,
  CodegenIR,
  CodegenResolvedField,
  CodegenSchema,
} from './types';
import { toPascalCase } from './utils/naming';

export function adaptIR(appIR: AppIR): CodegenIR {
  // Collect named schemas
  const rawSchemas = appIR.schemas.filter((s) => s.isNamed && s.jsonSchema);

  // Detect collisions — same name from different modules
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

  // Sort schemas deterministically
  const allSchemas = [...schemas].sort((a, b) => a.name.localeCompare(b.name));

  // Process entities into entity-specific codegen modules
  const entities = (appIR.entities ?? []).map((entity) => {
    const entityPascal = toPascalCase(entity.name);

    const operations: CodegenEntityOperation[] = [];
    const crudOps = [
      { kind: 'list', method: 'GET', path: `/${entity.name}`, schema: 'response' },
      { kind: 'get', method: 'GET', path: `/${entity.name}/:id`, schema: 'response' },
      { kind: 'create', method: 'POST', path: `/${entity.name}`, schema: 'createInput' },
      { kind: 'update', method: 'PATCH', path: `/${entity.name}/:id`, schema: 'updateInput' },
      { kind: 'delete', method: 'DELETE', path: `/${entity.name}/:id`, schema: 'response' },
    ] as const;

    for (const op of crudOps) {
      const accessKind = entity.access[op.kind as keyof typeof entity.access];
      if (accessKind === 'false') continue;

      // Extract resolvedFields from the appropriate schema ref
      let resolvedFields: CodegenResolvedField[] | undefined;
      if (op.kind === 'create' || op.kind === 'update') {
        const schemaRef = entity.modelRef.schemaRefs[op.schema as 'createInput' | 'updateInput'];
        if (schemaRef?.kind === 'inline') {
          resolvedFields = (schemaRef as InlineSchemaRef).resolvedFields?.map((f) => ({
            name: f.name,
            tsType: f.tsType,
            optional: f.optional,
          }));
        }
      }

      // Extract responseFields from response schema ref
      let responseFields: CodegenResolvedField[] | undefined;
      const responseRef = entity.modelRef.schemaRefs.response;
      if (responseRef?.kind === 'inline') {
        responseFields = (responseRef as InlineSchemaRef).resolvedFields?.map((f) => ({
          name: f.name,
          tsType: f.tsType,
          optional: f.optional,
        }));
      }

      operations.push({
        kind: op.kind,
        method: op.method,
        path: op.path,
        operationId: `${op.kind}${entityPascal}`,
        outputSchema: entity.modelRef.schemaRefs.resolved ? `${entityPascal}Response` : undefined,
        inputSchema:
          (op.kind === 'create' || op.kind === 'update') && entity.modelRef.schemaRefs.resolved
            ? `${op.kind === 'create' ? 'Create' : 'Update'}${entityPascal}Input`
            : undefined,
        resolvedFields,
        responseFields,
      });
    }

    const actions = entity.actions
      .filter((a) => entity.access.custom[a.name] !== 'false')
      .map((a) => ({
        name: a.name,
        operationId: `${a.name}${entityPascal}`,
        path: `/${entity.name}/:id/${a.name}`,
      }));

    return { entityName: entity.name, operations, actions };
  });

  return {
    basePath: appIR.app.basePath,
    version: appIR.app.version,
    modules: [],
    schemas: allSchemas,
    entities,
    auth: { schemes: [] },
  };
}
