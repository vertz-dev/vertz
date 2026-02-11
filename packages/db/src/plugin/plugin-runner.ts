import type { DbPlugin, QueryContext } from './plugin-types';

export interface PluginRunner {
  runBeforeQuery(context: QueryContext): QueryContext | undefined;
  runAfterQuery(context: QueryContext, result: unknown): unknown;
}

/**
 * Create a plugin runner that executes hooks across a set of plugins.
 *
 * @experimental
 */
export function createPluginRunner(plugins: DbPlugin[]): PluginRunner {
  return {
    runBeforeQuery(context: QueryContext): QueryContext | undefined {
      for (const plugin of plugins) {
        if (plugin.beforeQuery) {
          const result = plugin.beforeQuery(context);
          if (result !== undefined) {
            return result;
          }
        }
      }
      return undefined;
    },

    runAfterQuery(context: QueryContext, result: unknown): unknown {
      let current = result;
      for (const plugin of plugins) {
        if (plugin.afterQuery) {
          current = plugin.afterQuery(context, current);
        }
      }
      return current;
    },
  };
}
