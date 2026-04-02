import type { NormalizerConfig, OperationContext } from '../parser/operation-id-normalizer';

/**
 * Adapter for NestJS-generated OpenAPI specs (via @nestjs/swagger).
 *
 * NestJS generates operationIds in the format: `{ControllerName}_{methodName}`
 * e.g. `TasksController_findAll`, `UsersController.getById`
 *
 * This adapter strips the Controller prefix, returning just the method name.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@vertz/openapi';
 * import { nestjs } from '@vertz/openapi/adapters';
 *
 * export default defineConfig({
 *   source: './openapi.json',
 *   output: './src/generated',
 *   operationIds: nestjs(),
 * });
 * ```
 */
export function nestjs(): Pick<NormalizerConfig, 'transform'> {
  return {
    transform: (_cleaned: string, ctx: OperationContext) => {
      const match = ctx.operationId.match(/^[A-Za-z0-9]*Controller[_.](.+)$/);
      return match ? match[1]! : ctx.operationId;
    },
  };
}
