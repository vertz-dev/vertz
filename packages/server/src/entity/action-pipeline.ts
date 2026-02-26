import { type EntityError, EntityNotFoundError, err, ok, type Result } from '@vertz/errors';
import { enforceAccess } from './access-enforcer';
import type { CrudResult, EntityDbAdapter } from './crud-pipeline';
import type { EntityActionDef, EntityContext, EntityDefinition } from './types';

/**
 * Creates a handler function for a custom entity action.
 *
 * Pipeline: fetch row → enforce access → validate input → run handler → fire after hook → return result
 */
export function createActionHandler(
  def: EntityDefinition,
  actionName: string,
  actionDef: EntityActionDef,
  db: EntityDbAdapter,
): (ctx: EntityContext, id: string, rawInput: unknown) => Promise<Result<CrudResult, EntityError>> {
  return async (ctx, id, rawInput) => {
    // 1. Fetch the row
    const row = await db.get(id);
    if (!row) {
      return err(new EntityNotFoundError(`${def.name} with id "${id}" not found`));
    }

    // 2. Enforce access
    await enforceAccess(actionName, def.access, ctx, row);

    // 3. Validate input against schema
    const input = actionDef.input.parse(rawInput);

    // 4. Run the handler
    const result = await actionDef.handler(input, ctx, row);

    // 5. Fire after hook (fire-and-forget)
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
