/**
 * Context passed to plugin hooks.
 */
export interface QueryContext {
  table: string;
  operation: string;
  args: Record<string, unknown>;
  fingerprint: string;
}
/**
 * Plugin interface for the database.
 *
 * @experimental
 */
export interface DbPlugin {
  name: string;
  beforeQuery?(context: QueryContext): QueryContext | undefined;
  afterQuery?(context: QueryContext, result: unknown): unknown;
}
//# sourceMappingURL=plugin-types.d.ts.map
