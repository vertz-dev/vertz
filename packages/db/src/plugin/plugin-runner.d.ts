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
export declare function createPluginRunner(plugins: DbPlugin[]): PluginRunner;
//# sourceMappingURL=plugin-runner.d.ts.map
