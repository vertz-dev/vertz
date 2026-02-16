/**
 * Shared enum registry — define enums once, reuse across tables.
 *
 * @example
 * ```ts
 * const enums = createEnumRegistry({
 *   status: ['active', 'inactive', 'pending'],
 *   role: ['admin', 'editor', 'viewer'],
 * } as const);
 *
 * const orders = d.table('orders', {
 *   status: d.enum('status', enums.status),
 * });
 * const users = d.table('users', {
 *   role: d.enum('role', enums.role),
 * });
 * ```
 */
/** A registered enum entry with name and values accessible for d.enum(). */
export interface RegisteredEnum<TValues extends readonly string[]> {
  /** The enum name (same as the registry key). */
  readonly name: string;
  /** The enum values — compatible with d.enum()'s EnumSchemaLike interface. */
  readonly values: TValues;
}
type EnumRegistry<T extends Record<string, readonly string[]>> = {
  readonly [K in keyof T]: RegisteredEnum<T[K]>;
};
/**
 * Creates a shared enum registry from a map of enum names to their values.
 * The returned object can be passed directly to `d.enum(name, enums.myEnum)`.
 */
export declare function createEnumRegistry<T extends Record<string, readonly string[]>>(
  definitions: T,
): EnumRegistry<T>;
//# sourceMappingURL=enum-registry.d.ts.map
