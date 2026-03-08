import type { CodegenEntityModule } from '../types';

export interface RelationManifestEntry {
  entityType: string;
  schema: Record<string, { type: 'one' | 'many'; entity: string }>;
}

export function generateRelationManifest(entities: CodegenEntityModule[]): RelationManifestEntry[] {
  return entities.map((entity) => {
    const schema: Record<string, { type: 'one' | 'many'; entity: string }> = {};

    for (const rel of entity.relations ?? []) {
      schema[rel.name] = { type: rel.type, entity: rel.entity };
    }

    return { entityType: entity.entityName, schema };
  });
}
