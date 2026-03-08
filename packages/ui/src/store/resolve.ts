import type { EntityStore } from './entity-store';
import { getRelationSchema } from './relation-registry';

export function resolveReferences(
  entity: Record<string, unknown>,
  entityType: string,
  store: EntityStore,
  visiting?: Set<string>,
  refKeys?: Set<string>,
): Record<string, unknown> {
  const schema = getRelationSchema(entityType);

  if (!schema) {
    if (refKeys && typeof entity.id === 'string') {
      refKeys.add(`${entityType}:${entity.id}`);
    }
    return entity;
  }

  const visitKey = `${entityType}/${entity.id}`;
  const visit = visiting ?? new Set<string>();

  if (visit.has(visitKey)) {
    return entity;
  }
  visit.add(visitKey);

  if (refKeys && typeof entity.id === 'string') {
    refKeys.add(`${entityType}:${entity.id}`);
  }

  const resolved = { ...entity };

  for (const [field, rel] of Object.entries(schema)) {
    const value = entity[field];

    if (value == null) continue;

    if (rel.type === 'one') {
      if (typeof value === 'string') {
        const referenced = store.get(rel.entity, value).value;
        if (referenced) {
          resolved[field] = resolveReferences(
            referenced as Record<string, unknown>,
            rel.entity,
            store,
            visit,
            refKeys,
          );
        } else {
          resolved[field] = null;
        }
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Already denormalized — pass through
        resolved[field] = value;
      }
    } else if (rel.type === 'many') {
      if (Array.isArray(value)) {
        const items: Record<string, unknown>[] = [];
        for (const element of value) {
          if (typeof element === 'string') {
            const referenced = store.get(rel.entity, element).value;
            if (referenced) {
              items.push(
                resolveReferences(
                  referenced as Record<string, unknown>,
                  rel.entity,
                  store,
                  visit,
                  refKeys,
                ),
              );
            }
          } else if (typeof element === 'object' && element != null) {
            // Already denormalized — pass through
            items.push(element as Record<string, unknown>);
          }
        }
        resolved[field] = items;
      }
    }
  }

  return resolved;
}
