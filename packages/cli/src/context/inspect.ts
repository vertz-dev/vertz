import type { AppIR, EntityIR } from '@vertz/compiler';

export interface InspectEntity {
  fields: string[];
  access: Record<string, boolean>;
  relations: { name: string; type?: string; entity?: string }[];
}

export interface InspectOutput {
  entities: Record<string, InspectEntity>;
  summary: {
    entityCount: number;
  };
  suggestions: string[];
}

/**
 * Transforms AppIR into a structured inspect output for agents and humans.
 */
export function formatInspectOutput(ir: AppIR): InspectOutput {
  const entities: Record<string, InspectEntity> = {};

  for (const entity of ir.entities) {
    entities[entity.name] = {
      fields: extractFields(entity),
      access: {
        list: entity.access.list === 'function',
        get: entity.access.get === 'function',
        create: entity.access.create === 'function',
        update: entity.access.update === 'function',
        delete: entity.access.delete === 'function',
      },
      relations: entity.relations.map((r) => ({
        name: r.name,
        type: r.type,
        entity: r.entity,
      })),
    };
  }

  const suggestions = generateSuggestions(ir);

  return {
    entities,
    summary: {
      entityCount: ir.entities.length,
    },
    suggestions,
  };
}

function extractFields(entity: EntityIR): string[] {
  const schemaRef = entity.modelRef.schemaRefs.response;
  if (!schemaRef || schemaRef.kind !== 'inline' || !schemaRef.resolvedFields) {
    return [];
  }
  return schemaRef.resolvedFields.map((f: { name: string }) => f.name);
}

function generateSuggestions(ir: AppIR): string[] {
  const suggestions: string[] = [];

  if (ir.entities.length === 0) {
    suggestions.push(
      'No entities defined. Create src/api/schema.ts and src/api/entities/*.entity.ts',
    );
  }

  for (const entity of ir.entities) {
    // Check for entities with all-open access
    const access = entity.access;
    if (
      access.list === 'function' &&
      access.create === 'function' &&
      access.update === 'function' &&
      access.delete === 'function'
    ) {
      suggestions.push(
        `Entity '${entity.name}' has open access on all operations — consider restricting delete/update`,
      );
    }
  }

  return suggestions;
}
