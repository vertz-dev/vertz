import { getRelationSchema } from './relation-registry';

export interface NormalizedResult {
  normalized: Record<string, unknown>;
  extracted: Map<string, Record<string, unknown>[]>;
}

export function normalizeEntity(
  entityType: string,
  data: Record<string, unknown>,
  visiting?: Set<string>,
): NormalizedResult {
  const schema = getRelationSchema(entityType);

  if (!schema) {
    return { normalized: data, extracted: new Map() };
  }

  const extracted = new Map<string, Record<string, unknown>[]>();
  const normalized = { ...data };
  const visitKey = `${entityType}/${data.id}`;
  const visit = visiting ?? new Set<string>();

  if (visit.has(visitKey)) {
    return { normalized: data, extracted };
  }
  visit.add(visitKey);

  for (const [field, rel] of Object.entries(schema)) {
    const value = data[field];

    if (value == null) continue;

    if (rel.type === 'one') {
      if (typeof value === 'string') continue;
      if (typeof value === 'object' && !Array.isArray(value)) {
        const nested = value as Record<string, unknown>;
        if (typeof nested.id !== 'string') continue;

        const nestedVisitKey = `${rel.entity}/${nested.id}`;

        if (visit.has(nestedVisitKey)) {
          // Cycle detected — replace with bare ID, don't extract
          normalized[field] = nested.id;
          continue;
        }

        const nestedResult = normalizeEntity(rel.entity, nested, visit);
        const list = extracted.get(rel.entity) ?? [];
        list.push(nestedResult.normalized);
        extracted.set(rel.entity, list);

        for (const [type, items] of nestedResult.extracted) {
          const existing = extracted.get(type) ?? [];
          existing.push(...items);
          extracted.set(type, existing);
        }

        normalized[field] = nested.id;
      }
    } else if (rel.type === 'many') {
      if (!Array.isArray(value)) continue;

      const ids: unknown[] = [];
      for (const element of value) {
        if (typeof element === 'string') {
          ids.push(element);
        } else if (
          typeof element === 'object' &&
          element != null &&
          typeof (element as Record<string, unknown>).id === 'string'
        ) {
          const nested = element as Record<string, unknown>;
          const nestedVisitKey = `${rel.entity}/${nested.id}`;

          if (visit.has(nestedVisitKey)) {
            ids.push(nested.id);
            continue;
          }

          const nestedResult = normalizeEntity(rel.entity, nested, visit);
          const list = extracted.get(rel.entity) ?? [];
          list.push(nestedResult.normalized);
          extracted.set(rel.entity, list);

          for (const [type, items] of nestedResult.extracted) {
            const existing = extracted.get(type) ?? [];
            existing.push(...items);
            extracted.set(type, existing);
          }

          ids.push(nested.id);
        } else {
          ids.push(element);
        }
      }
      normalized[field] = ids;
    }
  }

  return { normalized, extracted };
}
