import type { TableEntry } from './inference';
import type { RelationDef } from './relation';
import { createManyRelation, createOneRelation } from './relation';
import type { ColumnRecord, TableDef } from './table';

// ---------------------------------------------------------------------------
// ColumnKeys — extracts string column keys from a TableDef
// ---------------------------------------------------------------------------

/**
 * Extracts the string column keys from a TableDef's _columns record.
 * Used to constrain FK arguments at the type level.
 */
type ColumnKeys<T extends TableDef<ColumnRecord>> =
  T extends TableDef<infer C> ? Extract<keyof C, string> : never;

// ---------------------------------------------------------------------------
// TypedRef — per-table ref builder with FK validation
// ---------------------------------------------------------------------------

/**
 * A ref builder scoped to a specific source table within a registry.
 *
 * - `one()` validates: target name is a registry key, FK is a column of the SOURCE table
 * - `many()` validates: target name is a registry key, FK is a column of the TARGET table
 */
interface TypedRef<
  TTables extends Record<string, TableDef<ColumnRecord>>,
  TSourceTable extends TableDef<ColumnRecord>,
> {
  /** belongsTo — FK lives on the source table */
  one<TTargetName extends Extract<keyof TTables, string>, TFK extends ColumnKeys<TSourceTable>>(
    target: TTargetName,
    foreignKey: TFK,
  ): RelationDef<TTables[TTargetName], 'one'>;

  /** hasMany — FK lives on the target table */
  many<
    TTargetName extends Extract<keyof TTables, string>,
    TFK extends ColumnKeys<TTables[TTargetName]>,
  >(target: TTargetName, foreignKey: TFK): RelationDef<TTables[TTargetName], 'many'>;
}

// ---------------------------------------------------------------------------
// PerTableRefFactory — mapped type creating refs per table
// ---------------------------------------------------------------------------

/**
 * An object keyed by table name where each value is a TypedRef scoped
 * to that table as the source. This enables `ref.posts.one('users', 'authorId')`
 * where TypeScript knows 'authorId' must be a column of `posts`.
 */
type PerTableRefFactory<TTables extends Record<string, TableDef<ColumnRecord>>> = {
  [K in Extract<keyof TTables, string>]: TypedRef<TTables, TTables[K]>;
};

// ---------------------------------------------------------------------------
// RegistryOutput — the output type of createRegistry()
// ---------------------------------------------------------------------------

/**
 * Maps each table key to a TableEntry, merging the table with its relations
 * from the callback (or empty relations if the table was omitted).
 */
type RegistryOutput<
  TTables extends Record<string, TableDef<ColumnRecord>>,
  TRelMap extends { [K in keyof TTables]?: Record<string, RelationDef> },
> = {
  [K in keyof TTables]: TableEntry<
    TTables[K],
    K extends keyof TRelMap
      ? TRelMap[K] extends Record<string, RelationDef>
        ? TRelMap[K]
        : // biome-ignore lint/complexity/noBannedTypes: {} represents an empty relations record for tables not in the callback
          {}
      : // biome-ignore lint/complexity/noBannedTypes: {} represents an empty relations record for tables not in the callback
        {}
  >;
};

// ---------------------------------------------------------------------------
// createRegistry() — main function
// ---------------------------------------------------------------------------

/**
 * Creates a typed table registry with compile-time validated relations.
 *
 * Tables without relations in the callback are auto-wrapped with `{ table, relations: {} }`.
 * The `ref` parameter is keyed by table name — use `ref.posts.one('users', 'authorId')`
 * to get compile-time validation that 'users' is a registry key and 'authorId' is a column
 * of the `posts` table.
 *
 * @example
 * ```typescript
 * const tables = createRegistry(
 *   { users, posts, comments },
 *   (ref) => ({
 *     posts: {
 *       author: ref.posts.one('users', 'authorId'),
 *       comments: ref.posts.many('comments', 'postId'),
 *     },
 *     comments: {
 *       post: ref.comments.one('posts', 'postId'),
 *       author: ref.comments.one('users', 'authorId'),
 *     },
 *   }),
 * );
 * ```
 */
export function createRegistry<
  TTables extends Record<string, TableDef<ColumnRecord>>,
  TRelMap extends { [K in keyof TTables]?: Record<string, RelationDef> },
>(
  tables: TTables,
  relationsCallback: (ref: PerTableRefFactory<TTables>) => TRelMap,
): RegistryOutput<TTables, TRelMap> {
  // Lookup helper — the type system guarantees only valid keys are passed,
  // so we safely return TableDef without the `undefined` union from index access.
  const lookup = (name: string): TableDef<ColumnRecord> =>
    (tables as Record<string, TableDef<ColumnRecord>>)[name] as TableDef<ColumnRecord>;

  // Build the per-table ref factory. Each key produces a TypedRef that
  // creates RelationDefs using the table lookup from the registry.
  const ref = new Proxy({} as PerTableRefFactory<TTables>, {
    get(_target, _sourceKey: string) {
      return {
        one(targetName: string, foreignKey: string) {
          return createOneRelation(() => lookup(targetName), foreignKey);
        },
        many(targetName: string, foreignKey: string) {
          return createManyRelation(() => lookup(targetName), foreignKey);
        },
      };
    },
  });

  const relationsMap = relationsCallback(ref);

  // Build the output: wrap every table in a TableEntry
  const relMap = relationsMap as Record<string, Record<string, RelationDef> | undefined>;
  const result: Record<string, TableEntry> = {};
  for (const key of Object.keys(tables)) {
    result[key] = {
      table: lookup(key),
      relations: relMap[key] ?? {},
    };
  }

  return result as RegistryOutput<TTables, TRelMap>;
}
