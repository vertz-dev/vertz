import type {
  CodegenEntityModule,
  CodegenIR,
  GeneratedFile,
  Generator,
  GeneratorConfig,
} from '../types';

export interface EntitySchemaManifestEntry {
  table?: string;
  primaryKey?: string;
  tenantScoped: boolean;
  hiddenFields: string[];
  fields: string[];
  relations: Record<string, { type: 'one' | 'many'; entity: string; selection: 'all' | string[] }>;
}

export type EntitySchemaManifest = Record<string, EntitySchemaManifestEntry>;

function buildManifestEntry(entity: CodegenEntityModule): EntitySchemaManifestEntry {
  const fields = (entity.responseFields ?? []).map((f) => f.name);

  const relations: EntitySchemaManifestEntry['relations'] = {};
  for (const rel of entity.relations ?? []) {
    const selection = entity.relationSelections?.[rel.name] ?? 'all';
    relations[rel.name] = { type: rel.type, entity: rel.entity, selection };
  }

  return {
    ...(entity.table !== undefined ? { table: entity.table } : {}),
    primaryKey: entity.primaryKey,
    tenantScoped: entity.tenantScoped ?? false,
    hiddenFields: entity.hiddenFields ?? [],
    fields,
    relations,
  };
}

export class EntitySchemaManifestGenerator implements Generator {
  readonly name = 'entity-schema-manifest';

  generate(ir: CodegenIR, _config: GeneratorConfig): GeneratedFile[] {
    const manifest: EntitySchemaManifest = {};

    for (const entity of ir.entities) {
      manifest[entity.entityName] = buildManifestEntry(entity);
    }

    return [
      {
        path: 'entity-schema.json',
        content: JSON.stringify(manifest, null, 2),
      },
    ];
  }
}
