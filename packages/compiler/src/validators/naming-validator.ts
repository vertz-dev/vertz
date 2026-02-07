import type { Validator } from '../compiler';
import type { Diagnostic } from '../errors';
import { createDiagnostic } from '../errors';
import type { AppIR } from '../ir/types';

export interface ParsedSchemaName {
  operation: string | null;
  entity: string | null;
  part: string | null;
}

export type ValidOperation = 'create' | 'read' | 'update' | 'list' | 'delete';

export type ValidPart = 'Body' | 'Response' | 'Query' | 'Params' | 'Headers';

const VALID_OPERATIONS: ReadonlySet<string> = new Set<ValidOperation>([
  'create',
  'read',
  'update',
  'list',
  'delete',
]);

const VALID_PARTS: ReadonlySet<string> = new Set<ValidPart>([
  'Body',
  'Response',
  'Query',
  'Params',
  'Headers',
]);

export class NamingValidator implements Validator {
  async validate(ir: AppIR): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const schema of ir.schemas) {
      if (!schema.isNamed) continue;
      const parsed = this.parseSchemaName(schema.name);
      if (parsed.operation && parsed.entity && parsed.part) continue;

      diagnostics.push(
        createDiagnostic({
          severity: 'warning',
          code: 'VERTZ_SCHEMA_NAMING',
          message: `Schema '${schema.name}' does not follow the {operation}{Entity}{Part} naming convention.`,
          file: schema.sourceFile,
          line: schema.sourceLine,
          column: schema.sourceColumn,
          suggestion: this.suggestFix(schema.name),
        }),
      );
    }

    return diagnostics;
  }

  parseSchemaName(name: string): ParsedSchemaName {
    if (!name) return { operation: null, entity: null, part: null };

    // Try to match a valid operation prefix
    let matchedOp: string | null = null;
    let rest = '';
    for (const op of VALID_OPERATIONS) {
      if (!name.startsWith(op)) continue;
      const remainder = name.slice(op.length);
      if (
        !remainder ||
        remainder[0] !== remainder[0].toUpperCase() ||
        remainder[0] === remainder[0].toLowerCase()
      )
        continue;
      matchedOp = op;
      rest = remainder;
      break;
    }

    if (!matchedOp) return { operation: null, entity: null, part: null };

    // Try to match a valid part suffix
    for (const part of VALID_PARTS) {
      if (!rest.endsWith(part)) continue;
      const entity = rest.slice(0, rest.length - part.length);
      if (!entity) continue;
      return { operation: matchedOp, entity, part };
    }

    // Operation matched but part didn't
    return { operation: matchedOp, entity: null, part: null };
  }

  private suggestFix(name: string): string | undefined {
    // Check for uppercase operation (e.g., CreateUserBody -> createUserBody)
    const lowerName = name[0].toLowerCase() + name.slice(1);
    const parsedLower = this.parseSchemaName(lowerName);
    if (parsedLower.operation && parsedLower.entity && parsedLower.part) {
      return `Use lowercase operation: '${lowerName}'`;
    }

    // Check for lowercase entity (e.g., createuserBody -> createUserBody)
    for (const op of VALID_OPERATIONS) {
      if (!name.startsWith(op)) continue;
      const rest = name.slice(op.length);
      if (!rest) continue;
      const capitalizedRest = rest[0].toUpperCase() + rest.slice(1);
      const fixed = op + capitalizedRest;
      const parsedFixed = this.parseSchemaName(fixed);
      if (parsedFixed.operation && parsedFixed.entity && parsedFixed.part) {
        return `Use PascalCase entity: '${fixed}'`;
      }
    }

    return undefined;
  }
}
