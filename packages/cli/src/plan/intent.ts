export interface FieldIntent {
  name: string;
  type: string;
  defaultValue?: string;
}

export interface EntityIntent {
  name: string;
  fields: FieldIntent[];
  belongsTo: string[];
}

/**
 * Parses CLI arguments into a structured entity intent.
 * Auto-adds id + createdAt if not provided, and FK fields for belongs-to.
 */
export function parseEntityIntent(
  name: string,
  fieldsStr: string,
  belongsTo: string[] = [],
): EntityIntent {
  if (!name.trim()) {
    throw new Error('Entity name is required');
  }

  if (!fieldsStr.trim()) {
    throw new Error('At least one field is required (e.g., --fields "title:text")');
  }

  // Parse field definitions
  const userFields = fieldsStr
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => {
      const parts = f.split(':').map((p) => p.trim());
      const field: FieldIntent = {
        name: parts[0]!,
        type: parts[1] ?? 'text',
      };
      if (parts[2]) {
        field.defaultValue = parts[2];
      }
      return field;
    });

  const fields: FieldIntent[] = [];
  const userFieldNames = new Set(userFields.map((f) => f.name));

  // Auto-add id if not provided
  if (!userFieldNames.has('id')) {
    fields.push({ name: 'id', type: 'uuid' });
  }

  // Add user fields
  fields.push(...userFields);

  // Add FK fields for belongs-to relations
  for (const parent of belongsTo) {
    const fkName = `${parent.replace(/s$/, '')}Id`;
    if (!userFieldNames.has(fkName)) {
      fields.push({ name: fkName, type: 'uuid' });
    }
  }

  // Auto-add createdAt if not provided
  if (!userFieldNames.has('createdAt')) {
    fields.push({ name: 'createdAt', type: 'timestamp' });
  }

  return {
    name: name.trim(),
    fields,
    belongsTo,
  };
}
