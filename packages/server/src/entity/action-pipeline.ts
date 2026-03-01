import {
  BadRequestError,
  type EntityError,
  EntityNotFoundError,
  err,
  ok,
  type Result,
} from '@vertz/errors';
import { enforceAccess } from './access-enforcer';
import type { CrudResult, EntityDbAdapter } from './crud-pipeline';
import type { EntityActionDef, EntityContext, EntityDefinition } from './types';

/**
 * Creates a handler function for a custom entity action.
 *
 * Record-level (hasId: true): fetch row → enforce access → validate input → run handler → fire after hook
 * Collection-level (hasId: false): enforce access with null row → validate input → run handler with null row
 */
export function createActionHandler(
  def: EntityDefinition,
  actionName: string,
  actionDef: EntityActionDef,
  db: EntityDbAdapter,
  hasId: boolean,
): (
  ctx: EntityContext,
  id: string | null,
  rawInput: unknown,
) => Promise<Result<CrudResult, EntityError>> {
  return async (ctx, id, rawInput) => {
    let row: Record<string, unknown> | null = null;

    if (hasId) {
      // Record-level: fetch the row
      row = await db.get(id as string);
      if (!row) {
        return err(new EntityNotFoundError(`${def.name} with id "${id}" not found`));
      }
    }

    // Enforce access (row is null for collection-level actions)
    const accessResult = await enforceAccess(actionName, def.access, ctx, row ?? {});
    if (!accessResult.ok) return err(accessResult.error);

    // Validate input against schema
    const parseResult = actionDef.body.parse(rawInput);
    if (!parseResult.ok) {
      return err(new BadRequestError(parseResult.error.message));
    }
    const input = parseResult.data;

    // Run the handler
    const result = await actionDef.handler(input, ctx, row);

    // Fire after hook (fire-and-forget)
    const afterHooks = def.after as Record<string, ((...args: unknown[]) => void) | undefined>;
    const afterHook = afterHooks[actionName];
    if (afterHook) {
      try {
        await afterHook(result, ctx, row);
      } catch {
        // After hooks are fire-and-forget
      }
    }

    return ok({ status: 200, body: result });
  };
}
