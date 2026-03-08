export interface RelationFieldDef {
  readonly type: 'one' | 'many';
  readonly entity: string;
}

export interface RelationSchema {
  readonly [fieldName: string]: RelationFieldDef;
}

const registry = new Map<string, RelationSchema>();

export function registerRelationSchema(entityType: string, schema: RelationSchema): void {
  registry.set(entityType, Object.freeze(schema));
}

export function getRelationSchema(entityType: string): RelationSchema | undefined {
  return registry.get(entityType);
}

export function resetRelationSchemas_TEST_ONLY(): void {
  registry.clear();
}
