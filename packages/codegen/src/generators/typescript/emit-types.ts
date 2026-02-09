import { jsonSchemaToTS } from '../../json-schema-converter';
import type { CodegenOperation, CodegenSchema, FileFragment, Import } from '../../types';
import { toPascalCase } from '../../utils/naming';

function emitTypeDeclaration(name: string, tsType: string): string {
  if (tsType.startsWith('{')) {
    return `export interface ${name} ${tsType}`;
  }
  return `export type ${name} = ${tsType};`;
}

export function emitInterfaceFromSchema(schema: CodegenSchema): FileFragment {
  const result = jsonSchemaToTS(schema.jsonSchema);

  const lines: string[] = [];

  // Emit extracted $defs as additional types first
  for (const [name, tsType] of result.extractedTypes) {
    lines.push(emitTypeDeclaration(name, tsType));
    lines.push('');
  }

  // JSDoc comment
  const jsdocParts: string[] = [];
  if (schema.annotations.description) {
    jsdocParts.push(schema.annotations.description);
  }
  if (schema.annotations.deprecated) {
    jsdocParts.push('@deprecated');
  }
  if (jsdocParts.length > 0) {
    lines.push(`/** ${jsdocParts.join('\n * ')} */`);
  }

  // Object types emit as interfaces; everything else as type aliases
  lines.push(emitTypeDeclaration(schema.name, result.type));

  return { content: lines.join('\n'), imports: [] };
}

export function emitOperationInputType(op: CodegenOperation): FileFragment {
  const typeName = `${toPascalCase(op.operationId)}Input`;
  const imports: Import[] = [];
  const slots: string[] = [];

  if (op.params) {
    const ref = op.schemaRefs.params;
    if (ref) {
      slots.push(`params: ${ref}`);
      imports.push({ from: '', name: ref, isType: true });
    } else {
      const result = jsonSchemaToTS(op.params);
      slots.push(`params: ${result.type}`);
    }
  }

  if (op.query) {
    const ref = op.schemaRefs.query;
    if (ref) {
      slots.push(`query?: ${ref}`);
      imports.push({ from: '', name: ref, isType: true });
    } else {
      const result = jsonSchemaToTS(op.query);
      slots.push(`query?: ${result.type}`);
    }
  }

  if (op.body) {
    const ref = op.schemaRefs.body;
    if (ref) {
      slots.push(`body: ${ref}`);
      imports.push({ from: '', name: ref, isType: true });
    } else {
      const result = jsonSchemaToTS(op.body);
      slots.push(`body: ${result.type}`);
    }
  }

  if (op.headers) {
    const ref = op.schemaRefs.headers;
    if (ref) {
      slots.push(`headers?: ${ref}`);
      imports.push({ from: '', name: ref, isType: true });
    } else {
      const result = jsonSchemaToTS(op.headers);
      slots.push(`headers?: ${result.type}`);
    }
  }

  // No input type needed if operation has no input slots
  if (slots.length === 0) {
    return { content: '', imports: [] };
  }

  const lines: string[] = [];
  lines.push(`/** Input for ${op.operationId} */`);
  lines.push(`export interface ${typeName} { ${slots.join('; ')} }`);

  return { content: lines.join('\n'), imports };
}

export function emitOperationResponseType(op: CodegenOperation): FileFragment {
  const typeName = `${toPascalCase(op.operationId)}Response`;
  const imports: Import[] = [];

  if (!op.response) {
    return {
      content: `export type ${typeName} = void;`,
      imports: [],
    };
  }

  const ref = op.schemaRefs.response;
  if (ref) {
    imports.push({ from: '', name: ref, isType: true });
    return {
      content: `export type ${typeName} = ${ref};`,
      imports,
    };
  }

  const result = jsonSchemaToTS(op.response);
  return {
    content: emitTypeDeclaration(typeName, result.type),
    imports: [],
  };
}

export function emitStreamingEventType(op: CodegenOperation): FileFragment {
  if (!op.streaming) {
    return { content: '', imports: [] };
  }

  const typeName = `${toPascalCase(op.operationId)}Event`;

  if (!op.streaming.eventSchema) {
    return {
      content: `export type ${typeName} = unknown;`,
      imports: [],
    };
  }

  const result = jsonSchemaToTS(op.streaming.eventSchema);
  return {
    content: emitTypeDeclaration(typeName, result.type),
    imports: [],
  };
}
