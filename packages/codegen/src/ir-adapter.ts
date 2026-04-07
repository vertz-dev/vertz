import type { AppIR, AuthFeature, InlineSchemaRef } from '@vertz/compiler';
import type {
  CodegenAuthOperation,
  CodegenEntityOperation,
  CodegenExposeField,
  CodegenExposeRelation,
  CodegenIR,
  CodegenResolvedField,
  CodegenSchema,
  CodegenServiceAction,
  CodegenServiceModule,
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

  // Build entity name → responseFields map for cross-entity relation resolution
  const entityResponseFieldsMap = new Map<string, CodegenResolvedField[]>();
  for (const entity of appIR.entities ?? []) {
    const respRef = entity.modelRef.schemaRefs.response;
    if (respRef?.kind === 'inline') {
      const fields = (respRef as InlineSchemaRef).resolvedFields?.map((f) => ({
        name: f.name,
        tsType: f.tsType as CodegenResolvedField['tsType'],
        optional: f.optional,
      }));
      if (fields) entityResponseFieldsMap.set(entity.name, fields);
    }
  }

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
      .map((a) => {
        const actionPascal = toPascalCase(a.name);
        const path = a.path ? `/${entity.name}/${a.path}` : `/${entity.name}/:id/${a.name}`;

        // Extract resolvedFields from inline body/response schema refs
        let resolvedInputFields: CodegenResolvedField[] | undefined;
        if (a.body?.kind === 'inline') {
          resolvedInputFields = (a.body as InlineSchemaRef).resolvedFields?.map((f) => ({
            name: f.name,
            tsType: f.tsType,
            optional: f.optional,
          }));
        }

        let resolvedOutputFields: CodegenResolvedField[] | undefined;
        if (a.response?.kind === 'inline') {
          resolvedOutputFields = (a.response as InlineSchemaRef).resolvedFields?.map((f) => ({
            name: f.name,
            tsType: f.tsType,
            optional: f.optional,
          }));
        }

        return {
          name: a.name,
          method: a.method,
          operationId: `${a.name}${entityPascal}`,
          path,
          hasId: path.includes(':id'),
          inputSchema: a.body ? `${actionPascal}${entityPascal}Input` : undefined,
          outputSchema: a.response ? `${actionPascal}${entityPascal}Output` : undefined,
          resolvedInputFields,
          resolvedOutputFields,
        };
      });

    // Map fully-resolved relations (both type and entity known)
    const resolvedRelations = entity.relations
      .filter(
        (r): r is typeof r & { type: 'one' | 'many'; entity: string } => !!r.type && !!r.entity,
      )
      .map((r) => ({ name: r.name, type: r.type, entity: r.entity }));

    // Build relation selections map from EntityRelationIR
    const relationSelections: Record<string, 'all' | string[]> = {};
    const relationQueryConfig: Record<
      string,
      { allowWhere?: string[]; allowOrderBy?: string[]; maxLimit?: number }
    > = {};
    for (const rel of entity.relations) {
      relationSelections[rel.name] = rel.selection;
      if (rel.allowWhere || rel.allowOrderBy || rel.maxLimit !== undefined) {
        relationQueryConfig[rel.name] = {
          ...(rel.allowWhere ? { allowWhere: rel.allowWhere } : {}),
          ...(rel.allowOrderBy ? { allowOrderBy: rel.allowOrderBy } : {}),
          ...(rel.maxLimit !== undefined ? { maxLimit: rel.maxLimit } : {}),
        };
      }
    }

    // Extract top-level response fields for the manifest
    let entityResponseFields: CodegenResolvedField[] | undefined;
    const respRef = entity.modelRef.schemaRefs.response;
    if (respRef?.kind === 'inline') {
      entityResponseFields = (respRef as InlineSchemaRef).resolvedFields?.map((f) => ({
        name: f.name,
        tsType: f.tsType,
        optional: f.optional,
      }));
    }

    // Process expose config: filter responseFields, map exposeSelect/exposeInclude
    let exposeSelect: CodegenExposeField[] | undefined;
    let allowWhere: Array<{ name: string; tsType: CodegenResolvedField['tsType'] }> | undefined;
    let allowOrderBy: string[] | undefined;
    let exposeInclude: CodegenExposeRelation[] | undefined;

    if (entity.expose) {
      exposeSelect = entity.expose.select.map((f) => ({
        name: f.name,
        conditional: f.conditional,
      }));

      // Resolve allowWhere with tsType from responseFields
      if (entity.expose.allowWhere?.length && entityResponseFields) {
        const fieldMap = new Map(entityResponseFields.map((f) => [f.name, f.tsType]));
        const resolved = entity.expose.allowWhere
          .filter((name) => fieldMap.has(name))
          .map((name) => ({ name, tsType: fieldMap.get(name)! }));
        if (resolved.length > 0) allowWhere = resolved;
      }

      // Pass through allowOrderBy
      if (entity.expose.allowOrderBy?.length) {
        allowOrderBy = entity.expose.allowOrderBy;
      }

      // Filter responseFields to only include exposed, non-hidden fields
      if (entityResponseFields) {
        const exposedNames = new Set(entity.expose.select.map((f) => f.name));
        const hiddenNames = new Set(entity.modelRef.hiddenFields ?? []);
        entityResponseFields = entityResponseFields.filter(
          (f) => exposedNames.has(f.name) && !hiddenNames.has(f.name),
        );

        // Also update per-operation responseFields so types generator uses filtered fields
        for (const op of operations) {
          if (op.responseFields) {
            op.responseFields = op.responseFields.filter(
              (f) => exposedNames.has(f.name) && !hiddenNames.has(f.name),
            );
          }
        }
      }

      // Resolve expose.include relations
      if (entity.expose.include && entity.expose.include.length > 0) {
        // Build lookup from entity.relations to resolve entity/type for expose.include entries
        const relationsLookup = new Map(
          entity.relations
            .filter((r) => r.type && r.entity)
            .map((r) => [r.name, { type: r.type as 'one' | 'many', entity: r.entity as string }]),
        );

        const resolved: CodegenExposeRelation[] = [];
        for (const rel of entity.expose.include) {
          // Resolve entity and type from the relations array if not set on the expose IR
          const relEntity = rel.entity ?? relationsLookup.get(rel.name)?.entity;
          const relType = rel.type ?? relationsLookup.get(rel.name)?.type;
          if (!relEntity || !relType) continue;

          const targetFields = entityResponseFieldsMap.get(relEntity);
          let resolvedFields: CodegenResolvedField[] | undefined;

          if (targetFields && rel.select) {
            const selectedNames = new Set(rel.select.map((f) => f.name));
            resolvedFields = targetFields.filter((f) => selectedNames.has(f.name));
          } else if (targetFields) {
            resolvedFields = targetFields;
          }

          resolved.push({
            name: rel.name,
            entity: relEntity,
            type: relType,
            ...(rel.select
              ? { select: rel.select.map((f) => ({ name: f.name, conditional: f.conditional })) }
              : {}),
            ...(resolvedFields ? { resolvedFields } : {}),
          });
        }

        if (resolved.length > 0) exposeInclude = resolved;
      }
    }

    return {
      entityName: entity.name,
      operations,
      actions,
      relations: resolvedRelations.length > 0 ? resolvedRelations : undefined,
      tenantScoped: entity.tenantScoped,
      table: entity.table,
      primaryKey: entity.modelRef.primaryKey,
      hiddenFields: entity.modelRef.hiddenFields,
      responseFields: entityResponseFields,
      exposeSelect,
      allowWhere,
      allowOrderBy,
      exposeInclude,
      relationSelections:
        Object.keys(relationSelections).length > 0 ? relationSelections : undefined,
      relationQueryConfig:
        Object.keys(relationQueryConfig).length > 0 ? relationQueryConfig : undefined,
    };
  });

  const access = appIR.access
    ? {
        entities: appIR.access.entities.map((e) => ({ name: e.name, roles: e.roles })),
        entitlements: appIR.access.entitlements,
        whereClauses: (appIR.access.whereClauses ?? []).map((wc) => ({
          entitlement: wc.entitlement,
          conditions: wc.conditions.map((c) => ({ ...c })),
        })),
      }
    : undefined;

  // Process standalone services into codegen service modules
  const services: CodegenServiceModule[] = (appIR.services ?? []).map((svc) => {
    const svcPascal = toPascalCase(svc.name);
    const actions: CodegenServiceAction[] = svc.actions
      .filter((a) => svc.access[a.name] !== 'false')
      .map((a) => {
        const actionPath = a.path ?? `/${svc.name}/${a.name}`;
        return {
          name: a.name,
          method: a.method,
          path: actionPath,
          operationId: `${a.name}${svcPascal}`,
        };
      });

    return { serviceName: svc.name, actions };
  });

  const authOperations = buildAuthOperations(appIR.auth?.features ?? []);

  return {
    basePath: appIR.app.basePath,
    version: appIR.app.version,
    modules: [],
    schemas: allSchemas,
    entities,
    services,
    auth: { schemes: [], operations: authOperations },
    access,
  };
}

/**
 * Maps auth feature flags to the concrete HTTP operations they expose.
 * Core operations (signOut, session, refresh) are always included when
 * any auth feature is configured.
 */
function buildAuthOperations(features: AuthFeature[]): CodegenAuthOperation[] {
  if (features.length === 0) return [];

  // Core operations — always available when auth is configured
  const ops: CodegenAuthOperation[] = [
    { operationId: 'signOut', method: 'POST', path: '/signout', hasBody: false },
    { operationId: 'session', method: 'GET', path: '/session', hasBody: false },
    { operationId: 'refresh', method: 'POST', path: '/refresh', hasBody: false },
  ];

  if (features.includes('emailPassword')) {
    ops.push(
      { operationId: 'signIn', method: 'POST', path: '/signin', hasBody: true },
      { operationId: 'signUp', method: 'POST', path: '/signup', hasBody: true },
    );
  }

  if (features.includes('tenant')) {
    ops.push(
      {
        operationId: 'switchTenant',
        method: 'POST',
        path: '/switch-tenant',
        hasBody: true,
      },
      {
        operationId: 'listTenants',
        method: 'GET',
        path: '/tenants',
        hasBody: false,
      },
    );
  }

  if (features.includes('providers')) {
    ops.push({ operationId: 'providers', method: 'GET', path: '/providers', hasBody: false });
  }

  return ops;
}
