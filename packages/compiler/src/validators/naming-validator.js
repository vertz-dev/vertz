import { createDiagnosticFromLocation } from '../errors';

const VALID_OPERATIONS = ['create', 'read', 'update', 'list', 'delete'];
const VALID_PARTS = ['Body', 'Response', 'Query', 'Params', 'Headers'];
const NULL_PARSED = { operation: null, entity: null, part: null };
function isUpperCase(char) {
  return char >= 'A' && char <= 'Z';
}
function isFullyParsed(parsed) {
  return parsed.operation !== null && parsed.entity !== null && parsed.part !== null;
}
export class NamingValidator {
  async validate(ir) {
    const diagnostics = [];
    for (const schema of ir.schemas) {
      if (!schema.isNamed) continue;
      if (isFullyParsed(this.parseSchemaName(schema.name))) continue;
      diagnostics.push(
        createDiagnosticFromLocation(schema, {
          severity: 'warning',
          code: 'VERTZ_SCHEMA_NAMING',
          message: `Schema '${schema.name}' does not follow the {operation}{Entity}{Part} naming convention.`,
          suggestion: this.suggestFix(schema.name),
        }),
      );
    }
    return diagnostics;
  }
  parseSchemaName(name) {
    if (!name) return NULL_PARSED;
    for (const op of VALID_OPERATIONS) {
      if (!name.startsWith(op)) continue;
      const rest = name.slice(op.length);
      if (!rest || !isUpperCase(rest[0])) continue;
      for (const part of VALID_PARTS) {
        if (!rest.endsWith(part)) continue;
        const entity = rest.slice(0, -part.length);
        if (!entity) continue;
        return { operation: op, entity, part };
      }
      return { operation: op, entity: null, part: null };
    }
    return NULL_PARSED;
  }
  suggestFix(name) {
    const lowerName = name[0].toLowerCase() + name.slice(1);
    if (isFullyParsed(this.parseSchemaName(lowerName))) {
      return `Use lowercase operation: '${lowerName}'`;
    }
    for (const op of VALID_OPERATIONS) {
      if (!name.startsWith(op)) continue;
      const rest = name.slice(op.length);
      if (!rest) continue;
      const fixed = op + rest[0].toUpperCase() + rest.slice(1);
      if (isFullyParsed(this.parseSchemaName(fixed))) {
        return `Use PascalCase entity: '${fixed}'`;
      }
    }
    return undefined;
  }
}
//# sourceMappingURL=naming-validator.js.map
