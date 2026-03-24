import type {
  CodegenAccess,
  CodegenEntityModule,
  CodegenIR,
  CodegenWhereCondition,
  GeneratedFile,
  Generator,
  GeneratorConfig,
} from '../types';
import { toSnakeCase } from '../utils/naming';

/** Maps entitlement action to Postgres FOR clause. */
const ACTION_TO_PG_OP: Record<string, string> = {
  list: 'SELECT',
  get: 'SELECT',
  view: 'SELECT',
  read: 'SELECT',
  create: 'INSERT',
  update: 'UPDATE',
  edit: 'UPDATE',
  delete: 'DELETE',
  remove: 'DELETE',
};

export class RlsPolicyGenerator implements Generator {
  readonly name = 'rls-policies';

  generate(ir: CodegenIR, _config: GeneratorConfig): GeneratedFile[] {
    const entityMap = buildEntityMap(ir.entities);
    const tables: Record<string, { enableRls: true; policies: RlsPolicyEntry[] }> = {};

    // Auto-generate tenant isolation policies for tenantScoped entities
    for (const entity of ir.entities) {
      if (!entity.tenantScoped) continue;
      const tableName = resolveTableName(entity);
      if (!tables[tableName]) {
        tables[tableName] = { enableRls: true, policies: [] };
      }
      tables[tableName].policies.push({
        name: `${tableName}_tenant_isolation`,
        for: 'ALL' as const,
        using: `tenant_id = current_setting('app.tenant_id')::UUID`,
      });
    }

    // Process explicit where clauses from access rules
    if (ir.access) {
      processWhereClauses(ir.access, entityMap, tables);
    }

    // No policies generated → no files
    if (Object.keys(tables).length === 0) {
      return [];
    }

    return [
      {
        path: 'rls-policies.json',
        content: JSON.stringify({ tables }, null, 2),
      },
    ];
  }
}

interface RlsPolicyEntry {
  name: string;
  for: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  using: string;
  withCheck?: string;
}

function buildEntityMap(entities: CodegenEntityModule[]): Map<string, CodegenEntityModule> {
  const map = new Map<string, CodegenEntityModule>();
  for (const entity of entities) {
    map.set(entity.entityName.toLowerCase(), entity);
  }
  return map;
}

function resolveTableName(entity: CodegenEntityModule): string {
  return entity.table ?? `${toSnakeCase(entity.entityName)}s`;
}

function resolveTableNameFromEntitlement(
  entitlement: string,
  entityMap: Map<string, CodegenEntityModule>,
): string {
  const colonIdx = entitlement.indexOf(':');
  const entityName = colonIdx >= 0 ? entitlement.slice(0, colonIdx) : entitlement;
  const entity = entityMap.get(entityName.toLowerCase());
  if (entity) {
    return resolveTableName(entity);
  }
  // Fallback: infer from entitlement
  return `${toSnakeCase(entityName)}s`;
}

function extractAction(entitlement: string): string {
  const colonIdx = entitlement.indexOf(':');
  return colonIdx >= 0 ? entitlement.slice(colonIdx + 1) : '';
}

/** Always quote identifiers to handle SQL reserved words (e.g., order, user, select). */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function renderCondition(condition: CodegenWhereCondition): string {
  const column = quoteIdentifier(toSnakeCase(condition.column));

  if (condition.kind === 'marker') {
    if (condition.marker === 'user.id') {
      return `${column} = current_setting('app.user_id')::UUID`;
    }
    return `${column} = current_setting('app.tenant_id')::UUID`;
  }

  // Literal
  if (typeof condition.value === 'string') {
    const escaped = condition.value.replace(/'/g, "''");
    return `${column} = '${escaped}'`;
  }
  return `${column} = ${condition.value}`;
}

function conditionsKey(conditions: CodegenWhereCondition[]): string {
  return conditions
    .map((c) => {
      if (c.kind === 'marker') return `${c.column}:${c.marker}`;
      return `${c.column}:${c.value}`;
    })
    .join('|');
}

/**
 * Checks if all conditions are tenant-only (user.tenantId markers).
 * Used to detect when explicit where clauses duplicate the auto tenant policy.
 */
function isTenantOnlyConditions(conditions: CodegenWhereCondition[]): boolean {
  return (
    conditions.length > 0 &&
    conditions.every((c) => c.kind === 'marker' && c.marker === 'user.tenantId')
  );
}

function processWhereClauses(
  access: CodegenAccess,
  entityMap: Map<string, CodegenEntityModule>,
  tables: Record<string, { enableRls: true; policies: RlsPolicyEntry[] }>,
): void {
  // Group where clauses by entity (table)
  const byTable = new Map<string, Array<{ action: string; conditions: CodegenWhereCondition[] }>>();

  for (const clause of access.whereClauses) {
    const tableName = resolveTableNameFromEntitlement(clause.entitlement, entityMap);
    const action = extractAction(clause.entitlement);

    if (!byTable.has(tableName)) {
      byTable.set(tableName, []);
    }
    byTable.get(tableName)!.push({ action, conditions: clause.conditions });
  }

  for (const [tableName, clauses] of byTable) {
    if (!tables[tableName]) {
      tables[tableName] = { enableRls: true, policies: [] };
    }

    const tableEntry = tables[tableName];
    const hasTenantIsolation = tableEntry.policies.some(
      (p) => p.name === `${tableName}_tenant_isolation`,
    );

    // Group by unique condition set to detect "same conditions for all actions" → FOR ALL
    const conditionGroups = new Map<
      string,
      { actions: string[]; conditions: CodegenWhereCondition[] }
    >();
    for (const clause of clauses) {
      const key = conditionsKey(clause.conditions);
      if (!conditionGroups.has(key)) {
        conditionGroups.set(key, { actions: [], conditions: clause.conditions });
      }
      conditionGroups.get(key)!.actions.push(clause.action);
    }

    for (const [, group] of conditionGroups) {
      // Skip tenant-only conditions if auto tenant isolation already covers this table
      if (hasTenantIsolation && isTenantOnlyConditions(group.conditions)) {
        continue;
      }

      // Filter out tenant conditions from mixed conditions (already covered by tenant policy)
      const effectiveConditions = hasTenantIsolation
        ? group.conditions.filter((c) => !(c.kind === 'marker' && c.marker === 'user.tenantId'))
        : group.conditions;

      if (effectiveConditions.length === 0) continue;

      const using = effectiveConditions.map(renderCondition).join(' AND ');

      // Determine if we should use FOR ALL or per-operation
      const allActions = new Set(group.actions);
      const pgOps = new Set(group.actions.map((a) => ACTION_TO_PG_OP[a]).filter(Boolean));

      // If all standard CRUD ops are covered or multiple actions map to same condition, use FOR ALL
      const useForAll = pgOps.size >= 3 || allActions.size >= 3;

      if (useForAll) {
        const policyName = `${tableName}_${toSnakeCase(group.actions[0] ?? 'all')}_policy`;
        tableEntry.policies.push({
          name: policyName,
          for: 'ALL',
          using,
        });
      } else {
        // Per-operation policies
        for (const action of group.actions) {
          const pgOp = ACTION_TO_PG_OP[action] ?? 'ALL';
          const policyName = `${tableName}_${toSnakeCase(action)}_policy`;
          tableEntry.policies.push({
            name: policyName,
            for: pgOp as RlsPolicyEntry['for'],
            using,
          });
        }
      }
    }
  }
}
