import type { Expression, Type } from 'ts-morph';
import type { ResolvedField, SchemaRef } from '../../ir/types';

export function resolveSchemaRefFromExpression(expr: Expression): SchemaRef {
  const sourceFile = expr.getSourceFile().getFilePath();
  const exprType = safeGetType(expr);
  const resolvedFields = exprType ? resolveFieldsFromSchemaType(exprType, expr) : undefined;
  const jsonSchema = buildJsonSchema(resolvedFields);
  return { kind: 'inline', sourceFile, jsonSchema, resolvedFields };
}

export function resolveFieldsFromSchemaType(
  schemaType: Type,
  location: Expression,
): ResolvedField[] | undefined {
  try {
    const parseProp = schemaType.getProperty('parse');
    if (!parseProp) return undefined;

    const parseType = parseProp.getTypeAtLocation(location);
    const callSignatures = parseType.getCallSignatures();
    if (callSignatures.length === 0) return undefined;

    const returnType = callSignatures[0]?.getReturnType();
    if (!returnType) return undefined;

    const dataType = unwrapResultType(returnType, location);
    if (!dataType) return undefined;

    const properties = dataType.getProperties();
    if (properties.length === 0) return undefined;

    const fields: ResolvedField[] = [];
    for (const fieldProp of properties) {
      const name = fieldProp.getName();
      const fieldType = fieldProp.getTypeAtLocation(location);
      const optional = fieldProp.isOptional();
      const tsType = mapTsType(fieldType);
      fields.push({ name, tsType, optional });
    }

    return fields;
  } catch {
    return undefined;
  }
}

export function buildJsonSchema(
  resolvedFields: ResolvedField[] | undefined,
): Record<string, unknown> {
  if (!resolvedFields || resolvedFields.length === 0) return {};

  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const field of resolvedFields) {
    properties[field.name] = tsTypeToJsonSchema(field.tsType);
    if (!field.optional) required.push(field.name);
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

export function tsTypeToJsonSchema(tsType: ResolvedField['tsType']): Record<string, unknown> {
  switch (tsType) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'date':
      return { type: 'string', format: 'date-time' };
    case 'unknown':
    default:
      return {};
  }
}

export function mapTsType(type: Type): ResolvedField['tsType'] {
  const typeText = type.getText();

  if (type.isUnion()) {
    const nonUndefined = type.getUnionTypes().filter((t) => !t.isUndefined());
    if (nonUndefined.length === 1 && nonUndefined[0]) {
      return mapTsType(nonUndefined[0]);
    }
  }

  if (type.isString() || type.isStringLiteral()) return 'string';
  if (type.isNumber() || type.isNumberLiteral()) return 'number';
  if (type.isBoolean() || type.isBooleanLiteral()) return 'boolean';
  if (typeText === 'Date') return 'date';

  return 'unknown';
}

export function unwrapResultType(type: Type, location: Expression): Type | undefined {
  if (type.isUnion()) {
    for (const member of type.getUnionTypes()) {
      const dataProp = member.getProperty('data');
      if (dataProp) {
        return dataProp.getTypeAtLocation(location);
      }
    }
    return undefined;
  }

  const dataProp = type.getProperty('data');
  if (dataProp) {
    return dataProp.getTypeAtLocation(location);
  }

  return type;
}

function safeGetType(expr: Expression): Type | undefined {
  try {
    return expr.getType();
  } catch {
    return undefined;
  }
}
