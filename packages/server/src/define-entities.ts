import type { EntityDefinition } from './entity/types';

/**
 * Identity function that preserves the EntityDefinition[] type.
 *
 * Allows defining entities in a separate file while retaining
 * full type inference:
 *
 * ```ts
 * // entities.ts
 * export const entities = defineEntities([users, projects, issues]);
 *
 * // server.ts
 * import { entities } from './entities';
 * createServer({ db, auth, entities });
 * ```
 */
export function defineEntities(entities: EntityDefinition[]): EntityDefinition[] {
  return entities;
}
