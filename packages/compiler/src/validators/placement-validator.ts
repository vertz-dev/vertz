import type { Validator } from '../compiler';
import type { Diagnostic } from '../errors';
import { createDiagnostic, createDiagnosticFromLocation } from '../errors';
import type { AppIR, SchemaIR } from '../ir/types';

export class PlacementValidator implements Validator {
  async validate(ir: AppIR): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const schema of ir.schemas) {
      this.checkFileLocation(schema, diagnostics);
    }

    this.checkMixedExports(ir.schemas, diagnostics);

    return diagnostics;
  }

  private checkFileLocation(schema: SchemaIR, diagnostics: Diagnostic[]): void {
    const file = schema.sourceFile;
    const inSchemasDir = file.includes('/schemas/') || file.includes('\\schemas\\');

    if (!inSchemasDir) {
      diagnostics.push(
        createDiagnosticFromLocation(schema, {
          severity: 'warning',
          code: 'VERTZ_SCHEMA_PLACEMENT',
          message: `Schema '${schema.name}' is not in a schemas/ directory.`,
          suggestion: `Move schema file to a 'schemas/' directory.`,
        }),
      );
      return;
    }

    if (!file.endsWith('.schema.ts')) {
      diagnostics.push(
        createDiagnosticFromLocation(schema, {
          severity: 'warning',
          code: 'VERTZ_SCHEMA_PLACEMENT',
          message: `Schema file '${file}' does not use the .schema.ts suffix.`,
          suggestion: `Rename file to use '.schema.ts' suffix.`,
        }),
      );
    }
  }

  private checkMixedExports(schemas: SchemaIR[], diagnostics: Diagnostic[]): void {
    const byFile = groupBy(schemas, (s) => s.sourceFile);

    for (const [file, fileSchemas] of byFile) {
      const withConvention = fileSchemas.filter(
        (s) => s.namingConvention.operation && s.namingConvention.entity,
      );
      if (withConvention.length < 2) continue;

      const operations = new Set(withConvention.map((s) => s.namingConvention.operation));
      if (operations.size > 1) {
        diagnostics.push(
          createDiagnostic({
            severity: 'warning',
            code: 'VERTZ_SCHEMA_PLACEMENT',
            message: `Schema file '${file}' exports schemas with mixed operations: ${[...operations].join(', ')}.`,
            file,
          }),
        );
      }

      const entities = new Set(withConvention.map((s) => s.namingConvention.entity));
      if (entities.size > 1) {
        diagnostics.push(
          createDiagnostic({
            severity: 'warning',
            code: 'VERTZ_SCHEMA_PLACEMENT',
            message: `Schema file '${file}' exports schemas with mixed entities: ${[...entities].join(', ')}.`,
            file,
          }),
        );
      }
    }
  }
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}
