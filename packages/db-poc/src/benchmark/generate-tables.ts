// ============================================================================
// Table Generator Script
// ============================================================================
// Run with: bun run src/benchmark/generate-tables.ts > src/benchmark/tables.ts
// Generates 100 table definitions with realistic distribution.
// ============================================================================

// Realistic SaaS table names grouped by domain
const tableGroups = [
  // Auth & Identity (10 tables)
  { name: 'users', domain: 'auth' },
  { name: 'sessions', domain: 'auth' },
  { name: 'api_keys', domain: 'auth' },
  { name: 'roles', domain: 'auth' },
  { name: 'permissions', domain: 'auth' },
  { name: 'role_permissions', domain: 'auth' },
  { name: 'user_roles', domain: 'auth' },
  { name: 'oauth_providers', domain: 'auth' },
  { name: 'oauth_connections', domain: 'auth' },
  { name: 'password_resets', domain: 'auth' },
  // Organizations & Teams (8 tables)
  { name: 'organizations', domain: 'org' },
  { name: 'org_members', domain: 'org' },
  { name: 'teams', domain: 'org' },
  { name: 'team_members', domain: 'org' },
  { name: 'invitations', domain: 'org' },
  { name: 'org_settings', domain: 'org' },
  { name: 'org_billing', domain: 'org' },
  { name: 'org_audit_logs', domain: 'org' },
  // Projects & Workspaces (10 tables)
  { name: 'projects', domain: 'project' },
  { name: 'project_members', domain: 'project' },
  { name: 'workspaces', domain: 'project' },
  { name: 'workspace_settings', domain: 'project' },
  { name: 'environments', domain: 'project' },
  { name: 'env_variables', domain: 'project' },
  { name: 'deployments', domain: 'project' },
  { name: 'deployment_logs', domain: 'project' },
  { name: 'branches', domain: 'project' },
  { name: 'project_tags', domain: 'project' },
  // Content & Assets (10 tables)
  { name: 'documents', domain: 'content' },
  { name: 'document_versions', domain: 'content' },
  { name: 'comments', domain: 'content' },
  { name: 'attachments', domain: 'content' },
  { name: 'media_files', domain: 'content' },
  { name: 'templates', domain: 'content' },
  { name: 'template_versions', domain: 'content' },
  { name: 'content_blocks', domain: 'content' },
  { name: 'tags', domain: 'content' },
  { name: 'content_tags', domain: 'content' },
  // Billing & Payments (10 tables)
  { name: 'subscriptions', domain: 'billing' },
  { name: 'plans', domain: 'billing' },
  { name: 'plan_features', domain: 'billing' },
  { name: 'invoices', domain: 'billing' },
  { name: 'invoice_items', domain: 'billing' },
  { name: 'payments', domain: 'billing' },
  { name: 'payment_methods', domain: 'billing' },
  { name: 'credits', domain: 'billing' },
  { name: 'coupons', domain: 'billing' },
  { name: 'usage_records', domain: 'billing' },
  // Notifications & Messaging (8 tables)
  { name: 'notifications', domain: 'notify' },
  { name: 'notification_prefs', domain: 'notify' },
  { name: 'email_templates', domain: 'notify' },
  { name: 'email_sends', domain: 'notify' },
  { name: 'webhooks', domain: 'notify' },
  { name: 'webhook_deliveries', domain: 'notify' },
  { name: 'channels', domain: 'notify' },
  { name: 'channel_messages', domain: 'notify' },
  // Analytics & Events (8 tables)
  { name: 'events', domain: 'analytics' },
  { name: 'event_types', domain: 'analytics' },
  { name: 'metrics', domain: 'analytics' },
  { name: 'metric_snapshots', domain: 'analytics' },
  { name: 'reports', domain: 'analytics' },
  { name: 'report_schedules', domain: 'analytics' },
  { name: 'dashboards', domain: 'analytics' },
  { name: 'dashboard_widgets', domain: 'analytics' },
  // Integrations & APIs (8 tables)
  { name: 'integrations', domain: 'integration' },
  { name: 'integration_configs', domain: 'integration' },
  { name: 'api_endpoints', domain: 'integration' },
  { name: 'api_requests', domain: 'integration' },
  { name: 'sync_jobs', domain: 'integration' },
  { name: 'sync_logs', domain: 'integration' },
  { name: 'data_mappings', domain: 'integration' },
  { name: 'connected_apps', domain: 'integration' },
  // Tasks & Workflows (10 tables)
  { name: 'tasks', domain: 'workflow' },
  { name: 'task_lists', domain: 'workflow' },
  { name: 'task_assignments', domain: 'workflow' },
  { name: 'task_comments', domain: 'workflow' },
  { name: 'workflows', domain: 'workflow' },
  { name: 'workflow_steps', domain: 'workflow' },
  { name: 'workflow_runs', domain: 'workflow' },
  { name: 'workflow_logs', domain: 'workflow' },
  { name: 'automations', domain: 'workflow' },
  { name: 'automation_triggers', domain: 'workflow' },
  // Settings & Config (8 tables)
  { name: 'feature_flags', domain: 'config' },
  { name: 'feature_flag_rules', domain: 'config' },
  { name: 'app_settings', domain: 'config' },
  { name: 'user_preferences', domain: 'config' },
  { name: 'themes', domain: 'config' },
  { name: 'locales', domain: 'config' },
  { name: 'translations', domain: 'config' },
  { name: 'audit_logs', domain: 'config' },
  // Files & Storage (10 tables)
  { name: 'files', domain: 'storage' },
  { name: 'file_versions', domain: 'storage' },
  { name: 'folders', domain: 'storage' },
  { name: 'file_shares', domain: 'storage' },
  { name: 'storage_buckets', domain: 'storage' },
  { name: 'upload_sessions', domain: 'storage' },
  { name: 'file_metadata', domain: 'storage' },
  { name: 'thumbnails', domain: 'storage' },
  { name: 'file_tags', domain: 'storage' },
  { name: 'storage_quotas', domain: 'storage' },
];

// Deterministic seeded random (simple LCG)
let seed = 42;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

// Column generators -- returning [name, definition] pairs as strings
function genColumns(tableName: string, index: number): string[] {
  const cols: string[] = [];

  // Every table gets id + timestamps
  cols.push('    id: d.uuid().primary()');
  cols.push('    created_at: d.timestamp().default()');
  cols.push('    updated_at: d.timestamp().default()');

  // Most tables get a name/title
  if (rand() > 0.2) {
    cols.push(`    name: d.text()`);
  }

  // Many tables get a description
  if (rand() > 0.4) {
    cols.push(`    description: d.text().nullable()`);
  }

  // FK to users or orgs
  if (rand() > 0.3) {
    cols.push(`    user_id: d.uuid()`);
  }
  if (rand() > 0.5) {
    cols.push(`    org_id: d.uuid()`);
  }

  // Extra text fields
  const extraTextCount = randInt(0, 2);
  const textNames = ['slug', 'title', 'label', 'code', 'display_name', 'short_name', 'external_id'];
  for (let i = 0; i < extraTextCount; i++) {
    const n = textNames[i % textNames.length];
    cols.push(`    ${n}: d.text()${rand() > 0.5 ? '.nullable()' : ''}`);
  }

  // Integer fields
  const intCount = randInt(0, 2);
  const intNames = ['sort_order', 'count', 'quantity', 'priority', 'position', 'version'];
  for (let i = 0; i < intCount; i++) {
    const n = intNames[i % intNames.length];
    cols.push(`    ${n}: d.integer()${rand() > 0.6 ? '.default()' : ''}`);
  }

  // Boolean fields
  if (rand() > 0.4) {
    const boolNames = ['is_active', 'is_deleted', 'is_archived', 'is_public', 'is_default'];
    cols.push(`    ${pick(boolNames)}: d.boolean().default()`);
  }

  // Enum field
  if (rand() > 0.5) {
    const enumSets = [
      `'active', 'inactive', 'pending'`,
      `'draft', 'published', 'archived'`,
      `'low', 'medium', 'high', 'critical'`,
      `'todo', 'in_progress', 'done'`,
      `'free', 'basic', 'pro', 'enterprise'`,
    ];
    cols.push(`    status: d.enum(${pick(enumSets)}).default()`);
  }

  // JSONB field
  if (rand() > 0.5) {
    const jsonNames = ['metadata', 'config', 'settings', 'data', 'properties'];
    cols.push(`    ${pick(jsonNames)}: d.jsonb().nullable()`);
  }

  // Sensitive field (0-1 per table)
  if (rand() > 0.7) {
    const sensitiveNames = ['email', 'phone', 'ip_address', 'token_hash'];
    cols.push(`    ${pick(sensitiveNames)}: d.text().sensitive()`);
  }

  // Hidden field (0-1 per table)
  if (rand() > 0.8) {
    const hiddenNames = ['internal_notes', 'debug_data', 'raw_payload'];
    cols.push(`    ${pick(hiddenNames)}: d.text().hidden()`);
  }

  return cols;
}

// Relations between tables
interface RelationSpec {
  name: string;
  type: 'one' | 'many';
  target: string;
}

function genRelations(tableName: string, index: number, allTables: typeof tableGroups): RelationSpec[] {
  const rels: RelationSpec[] = [];
  const usedNames = new Set<string>();
  const relCount = randInt(0, 3);

  // Pick related tables (prefer tables with lower index so they're already defined)
  for (let i = 0; i < relCount; i++) {
    const targetIdx = randInt(0, Math.min(index + 10, allTables.length - 1));
    if (targetIdx === index) continue; // skip self-references
    const target = allTables[targetIdx];

    const isMany = rand() > 0.5;
    const relName = isMany ? target.name : target.name.replace(/s$/, '');

    // Skip if we already have a relation with this name
    if (usedNames.has(relName)) continue;
    usedNames.add(relName);

    if (isMany) {
      rels.push({ name: relName, type: 'many', target: target.name });
    } else {
      rels.push({ name: relName, type: 'one', target: target.name });
    }
  }

  return rels;
}

// Generate the file
function generate(): string {
  const lines: string[] = [];

  lines.push(`// ============================================================================`);
  lines.push(`// Benchmark: 100 Table Definitions`);
  lines.push(`// ============================================================================`);
  lines.push(`// AUTO-GENERATED by generate-tables.ts`);
  lines.push(`// Realistic SaaS schema distribution:`);
  lines.push(`//   - 8-15 columns per table`);
  lines.push(`//   - Realistic column mix: UUIDs, text, timestamps, integers, booleans, enums, JSONB`);
  lines.push(`//   - 0-1 sensitive columns, 0-1 hidden columns per table`);
  lines.push(`//   - 0-3 relations per table (mix of one-to-one, one-to-many)`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`import { d } from '../builders/d.js';`);
  lines.push(``);

  // Generate each table
  for (let i = 0; i < tableGroups.length; i++) {
    const t = tableGroups[i];
    const varName = t.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const cols = genColumns(t.name, i);
    const rels = genRelations(t.name, i, tableGroups);

    lines.push(`export const ${varName} = d.table('${t.name}', {`);
    for (const col of cols) {
      lines.push(`${col},`);
    }

    if (rels.length > 0) {
      lines.push(`}, {`);
      lines.push(`  relations: {`);
      for (const rel of rels) {
        if (rel.type === 'one') {
          lines.push(`    ${rel.name}: d.ref.one('${rel.target}'),`);
        } else {
          lines.push(`    ${rel.name}: d.ref.many('${rel.target}'),`);
        }
      }
      lines.push(`  },`);
      lines.push(`});`);
    } else {
      lines.push(`});`);
    }
    lines.push(``);
  }

  // Generate the schema registry
  lines.push(`// ============================================================================`);
  lines.push(`// Schema Registry: all 100 tables`);
  lines.push(`// ============================================================================`);
  lines.push(``);
  lines.push(`export const schema = {`);
  for (const t of tableGroups) {
    const varName = t.name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    lines.push(`  ${t.name}: ${varName},`);
  }
  lines.push(`};`);
  lines.push(``);
  lines.push(`export type Schema = typeof schema;`);

  return lines.join('\n');
}

console.log(generate());
