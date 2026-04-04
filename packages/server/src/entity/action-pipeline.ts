import type { ModelDef } from '@vertz/db';
import {
  BadRequestError,
  type EntityError,
  EntityNotFoundError,
  err,
  ok,
  type Result,
} from '@vertz/errors';
import { filterProtectedHeaders, isResponseDescriptor } from '../response';
import { enforceAccess } from './access-enforcer';
import type { CrudResult, EntityDbAdapter, EntityId } from './crud-pipeline';
import { stripHiddenFields } from './field-filter';
import type { EntityActionDef, EntityContext, EntityDefinition } from './types';

/**
 * Creates a handler function for a custom entity action.
 *
 * Record-level (hasId: true): fetch row → enforce access → validate input → run handler → fire after hook
 * Collection-level (hasId: false): enforce access with null row → validate input → run handler with null row
 */
export function createActionHandler<TModel extends ModelDef = ModelDef>(
  def: EntityDefinition<TModel>,
  actionName: string,
  actionDef: EntityActionDef,
  db: EntityDbAdapter,
  hasId: boolean,
): (
  ctx: EntityContext<TModel>,
  id: EntityId | null,
  rawInput: unknown,
) => Promise<Result<CrudResult, EntityError>> {
  return async (ctx, id, rawInput) => {
    let row: TModel['table']['$response'] | null = null;

    if (hasId) {
      // Record-level: fetch the row
      row = (await db.get(id as string | Record<string, string>)) as
        | TModel['table']['$response']
        | null;
      if (!row) {
        const idDisplay = typeof id === 'string' ? id : JSON.stringify(id);
        return err(new EntityNotFoundError(`${def.name} with id "${idDisplay}" not found`));
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
    const handlerResult = await actionDef.handler(input, ctx, row);

    // Unwrap ResponseDescriptor if present (before stripHiddenFields)
    const isResp = isResponseDescriptor(handlerResult);
    const rawResult = isResp ? handlerResult.data : handlerResult;
    const customStatus = isResp ? handlerResult.status : undefined;
    const filteredHeaders = isResp ? filterProtectedHeaders(handlerResult.headers) : undefined;

    // Strip hidden fields from the result before exposing to hooks or response
    const table = def.model.table;
    const result =
      rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)
        ? stripHiddenFields(table, rawResult as Record<string, unknown>)
        : rawResult;

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

    return ok({ status: customStatus ?? 200, body: result, headers: filteredHeaders });
  };
}
