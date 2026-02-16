import { createManyRelation, createOneRelation } from './relation';
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
export function createRegistry(tables, relationsCallback) {
  // Lookup helper — the type system guarantees only valid keys are passed,
  // so we safely return TableDef without the `undefined` union from index access.
  const lookup = (name) => tables[name];
  // Build the per-table ref factory. Each key produces a TypedRef that
  // creates RelationDefs using the table lookup from the registry.
  const ref = new Proxy(
    {},
    {
      get(_target, _sourceKey) {
        return {
          one(targetName, foreignKey) {
            return createOneRelation(() => lookup(targetName), foreignKey);
          },
          many(targetName, foreignKey) {
            return createManyRelation(() => lookup(targetName), foreignKey);
          },
        };
      },
    },
  );
  const relationsMap = relationsCallback(ref);
  // Build the output: wrap every table in a TableEntry
  const relMap = relationsMap;
  const result = {};
  for (const key of Object.keys(tables)) {
    result[key] = {
      table: lookup(key),
      relations: relMap[key] ?? {},
    };
  }
  return result;
}
//# sourceMappingURL=registry.js.map
