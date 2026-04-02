import type { NormalizerConfig, OperationContext } from '../parser/operation-id-normalizer';

/**
 * Adapter for FastAPI-generated OpenAPI specs.
 *
 * FastAPI generates operationIds in the format: `{name}_{route}_{verb}`
 * e.g. `list_tasks_v1_tasks__get`, `get_user_v1_users__id__get`
 *
 * This adapter strips the route+verb suffix and appends the API version
 * prefix when present in the path (e.g. `/v1/`, `/v2/`).
 *
 * @example
 * ```ts
 * import { defineConfig } from '@vertz/openapi';
 * import { fastapi } from '@vertz/openapi/adapters';
 *
 * export default defineConfig({
 *   source: './openapi.json',
 *   output: './src/generated',
 *   operationIds: fastapi(),
 * });
 * ```
 */
export function fastapi(): Pick<NormalizerConfig, 'transform'> {
  return {
    transform: (_cleaned: string, ctx: OperationContext) => {
      const versionMatch = ctx.path.match(/^\/(v\d+)\//);
      const versionPrefix = versionMatch ? versionMatch[1] : undefined;

      const parsedRoute = ctx.path.replace(/^\//, '').replace(/[{}/-]/g, '_');

      const suffix = `_${parsedRoute}_${ctx.method.toLowerCase()}`;
      const operationId = ctx.operationId.replace(suffix, '');

      return versionPrefix && !operationId.endsWith(versionPrefix)
        ? `${operationId}_${versionPrefix}`
        : operationId;
    },
  };
}
