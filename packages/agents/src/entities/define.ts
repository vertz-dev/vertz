import { AppError } from '@vertz/errors';
import type { DatabaseClient, ModelDef, TableDef } from '@vertz/db';
import { d } from '@vertz/db';
// `@vertz/server` is an optional peer dep on `@vertz/agents` (see package.json).
// This subpath is only loaded when the consumer has `@vertz/server` installed,
// same as `@vertz/agents/cloudflare`.
import type { AccessRule, EntityDefinition } from '@vertz/server';
import { entity, rules } from '@vertz/server';

// Agent sessions / messages table names — stable contract with the store DDL.
const SESSION_TABLE = 'agent_sessions';
const MESSAGE_TABLE = 'agent_messages';

// `Partial<Record<op, AccessRule>>` is the shape `EntityConfig.access` accepts.
// Re-exported as `EntityAccess` for the public option types — keeps the surface
// at `@vertz/agents/entities` self-contained without forcing a new type through
// `@vertz/server`.
export type EntityAccess = Partial<
  Record<'list' | 'get' | 'create' | 'update' | 'delete', AccessRule>
>;

export interface DefineAgentEntitiesOptions {
  /** Override entity names if 'agent-session' / 'agent-message' collides with existing entities. */
  readonly sessionName?: string;
  readonly messageName?: string;
  /**
   * Override access rules. Defaults scope every op to `rules.where({ userId: rules.user.id })`,
   * with a `before.create` hook that injects `userId`/`tenantId` from the request context.
   * See `plans/agent-store-entity-bridge.md` (Rev 6) for the rationale behind `ctx.userId`
   * winning over any caller-supplied `userId` (prevents silent impersonation).
   */
  readonly sessionAccess?: EntityAccess;
  readonly messageAccess?: EntityAccess;
}

const defaultSessionAccess: EntityAccess = {
  list: rules.where({ userId: rules.user.id }),
  get: rules.where({ userId: rules.user.id }),
  create: rules.authenticated(),
  update: rules.where({ userId: rules.user.id }),
  delete: rules.where({ userId: rules.user.id }),
};

const defaultMessageAccess: EntityAccess = {
  list: rules.where({ userId: rules.user.id }),
  get: rules.where({ userId: rules.user.id }),
  // Writes default to denied — only the AgentStore writes messages, via the store path
  // which bypasses the entity CRUD pipeline entirely.
};

interface ModelEntryShape {
  readonly table: TableDef;
  readonly relations: Record<string, unknown>;
}

function findModelByTableName(
  models: Record<string, ModelEntryShape>,
  tableName: string,
): ModelEntryShape | null {
  for (const entry of Object.values(models)) {
    if (entry.table._name === tableName) return entry;
  }
  return null;
}

export class AgentBridgeMissingTableError extends AppError<'AGENT_BRIDGE_MISSING_TABLE'> {
  constructor(tableName: string) {
    super(
      'AGENT_BRIDGE_MISSING_TABLE',
      `defineAgentEntities: no model registered for table '${tableName}'. Spread the appropriate column pack into your own d.table('${tableName}', {...}) call and register it in createDb({ models: { ... } }).`,
    );
  }
}

/**
 * Build Vertz entities from tables registered in your `createDb({ models })` call.
 *
 * Requires the consumer to have registered two tables named `agent_sessions` and
 * `agent_messages` (or the names passed via `sessionName` / `messageName`) using the
 * column packs from this package. The factory:
 *
 *   1. Looks up the registered models via `db._internals.models`.
 *   2. Builds `entity()` definitions wired to those models.
 *   3. Installs a `before.create` hook on the session that auto-populates
 *      `userId` / `tenantId` from the request context.
 *
 * See `plans/agent-store-entity-bridge.md` and the mint-docs page at
 * `guides/agents/entity-bridge` for full usage.
 */
export function defineAgentEntities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DatabaseClient's generic would force callers through cumbersome type gymnastics; the factory validates the two required tables at runtime via _internals.models
  db: DatabaseClient<any>,
  opts: DefineAgentEntitiesOptions = {},
): { session: EntityDefinition; message: EntityDefinition } {
  const sessionName = opts.sessionName ?? 'agent-session';
  const messageName = opts.messageName ?? 'agent-message';

  const models = db._internals.models as unknown as Record<string, ModelEntryShape>;

  const sessionEntry = findModelByTableName(models, SESSION_TABLE);
  if (!sessionEntry) throw new AgentBridgeMissingTableError(SESSION_TABLE);

  const messageEntry = findModelByTableName(models, MESSAGE_TABLE);
  if (!messageEntry) throw new AgentBridgeMissingTableError(MESSAGE_TABLE);

  // Reconstruct ModelDef from the registry entry (which only carries table+relations,
  // not the derived schemas). d.model() adds the schemas.
  const sessionModel = d.model(
    sessionEntry.table,
    sessionEntry.relations as Record<string, never>,
  ) as ModelDef;
  const messageModel = d.model(
    messageEntry.table,
    messageEntry.relations as Record<string, never>,
  ) as ModelDef;

  // Only inject columns that actually exist on the session table. An extended schema
  // may drop `tenantId` (docs recommend this when adding a `.tenant()` relation) — in
  // that case the CRUD pipeline's tenant auto-set handles scoping, and this hook must
  // not fight it. `userId` is always handled here because no other layer populates it.
  const sessionColumns = sessionEntry.table._columns as Record<string, unknown>;
  const hasUserIdColumn = 'userId' in sessionColumns;
  const hasTenantIdColumn = 'tenantId' in sessionColumns;

  const session = entity(sessionName, {
    model: sessionModel,
    access: opts.sessionAccess ?? defaultSessionAccess,
    before: {
      create: (data, ctx) => {
        const patch: Record<string, unknown> = {};
        if (hasUserIdColumn) {
          // ctx.userId wins over input — prevents impersonation. See design doc Rev 6.
          patch.userId = ctx.userId ?? (data as { userId?: string | null }).userId ?? null;
        }
        if (hasTenantIdColumn) {
          patch.tenantId = ctx.tenantId ?? (data as { tenantId?: string | null }).tenantId ?? null;
        }
        return { ...data, ...patch };
      },
    },
  });

  const message = entity(messageName, {
    model: messageModel,
    access: opts.messageAccess ?? defaultMessageAccess,
  });

  return { session, message };
}
