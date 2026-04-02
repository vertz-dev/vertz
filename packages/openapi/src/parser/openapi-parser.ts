import { normalizeOperationId } from './operation-id-normalizer';
import { resolveSchema } from './ref-resolver';
import type {
  HttpMethod,
  OperationSecurity,
  ParsedOAuthFlows,
  ParsedOperation,
  ParsedParameter,
  ParsedSchema,
  ParsedSecurityScheme,
} from './types';

class OpenAPIParserError extends Error {
  override name = 'OpenAPIParserError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getVersion(spec: Record<string, unknown>): '3.0' | '3.1' {
  const version = spec.openapi;

  if (typeof version !== 'string') {
    throw new OpenAPIParserError('OpenAPI spec is missing required field: openapi');
  }

  if (version.startsWith('3.0')) {
    return '3.0';
  }

  if (version.startsWith('3.1')) {
    return '3.1';
  }

  throw new OpenAPIParserError(`Unsupported OpenAPI version: ${version}`);
}

function getRefTarget(ref: string, spec: Record<string, unknown>): Record<string, unknown> {
  if (!ref.startsWith('#/')) {
    throw new OpenAPIParserError(`External $ref values are not supported: ${ref}`);
  }

  let current: unknown = spec;

  for (const segment of ref.slice(2).split('/')) {
    if (!isRecord(current) || !(segment in current)) {
      throw new OpenAPIParserError(`Could not resolve $ref: ${ref}`);
    }

    current = current[segment];
  }

  if (!isRecord(current)) {
    throw new OpenAPIParserError(`Resolved $ref is not an object: ${ref}`);
  }

  return current;
}

function resolveOpenAPIObject(
  value: unknown,
  spec: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.$ref === 'string') {
    return resolveOpenAPIObject(getRefTarget(value.$ref, spec), spec);
  }

  return value;
}

function normalizeNullableSchema(schema: unknown, version: '3.0' | '3.1'): unknown {
  if (Array.isArray(schema)) {
    return schema.map((entry) => normalizeNullableSchema(entry, version));
  }

  if (!isRecord(schema)) {
    return schema;
  }

  const normalized: Record<string, unknown> = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, normalizeNullableSchema(value, version)]),
  );

  if (version !== '3.0' || normalized.nullable !== true) {
    return normalized;
  }

  const type = normalized.type;
  if (typeof type === 'string') {
    normalized.type = [type, 'null'];
  } else if (Array.isArray(type) && !type.includes('null')) {
    normalized.type = [...type, 'null'];
  }

  delete normalized.nullable;
  return normalized;
}

function getJsonContentSchema(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value.content)) {
    return undefined;
  }

  const mediaType = value.content['application/json'];
  if (!isRecord(mediaType) || !isRecord(mediaType.schema)) {
    return undefined;
  }

  return mediaType.schema;
}

function extractRefName(schema: Record<string, unknown>): string | undefined {
  if (typeof schema.$ref === 'string') {
    const segments = schema.$ref.split('/');
    return segments[segments.length - 1];
  }
  // For array schemas, extract the name from items.$ref
  if (schema.type === 'array' && isRecord(schema.items) && typeof schema.items.$ref === 'string') {
    const segments = schema.items.$ref.split('/');
    return segments[segments.length - 1];
  }
  return undefined;
}

function resolveSchemaForOutput(
  schema: Record<string, unknown>,
  spec: Record<string, unknown>,
  version: '3.0' | '3.1',
): ParsedSchema {
  const name = extractRefName(schema);
  const result: ParsedSchema = {
    jsonSchema: normalizeNullableSchema(
      resolveSchema(schema, spec, { specVersion: version }),
      version,
    ) as Record<string, unknown>,
  };
  if (name) result.name = name;
  return result;
}

function getOperationResponses(operation: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(operation.responses)) {
    return {};
  }

  return operation.responses;
}

function pickSuccessResponse(
  operation: Record<string, unknown>,
  spec: Record<string, unknown>,
): { status: number; schema?: Record<string, unknown> } {
  const entries = Object.entries(getOperationResponses(operation))
    .map(([status, response]) => ({ status: Number(status), response }))
    .filter(({ status }) => Number.isInteger(status) && status >= 200 && status < 300)
    .sort((left, right) => left.status - right.status);

  const first = entries[0];
  if (!first) {
    return { status: 200 };
  }

  const resolvedResponse = resolveOpenAPIObject(first.response, spec);
  return {
    status: first.status,
    schema: getJsonContentSchema(resolvedResponse),
  };
}

function getCombinedParameters(
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>,
  spec: Record<string, unknown>,
): Record<string, unknown>[] {
  const collect = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value
          .map((entry) => resolveOpenAPIObject(entry, spec))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      : [];

  return [...collect(pathItem.parameters), ...collect(operation.parameters)];
}

function getPathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((name): name is string => Boolean(name));
}

function toParsedParameter(
  parameter: Record<string, unknown> | undefined,
  name: string,
  spec: Record<string, unknown>,
  version: '3.0' | '3.1',
  requiredFallback: boolean,
): ParsedParameter {
  const resolvedSchema = isRecord(parameter?.schema)
    ? (normalizeNullableSchema(
        resolveSchema(parameter.schema, spec, { specVersion: version }),
        version,
      ) as Record<string, unknown>)
    : {};

  return {
    name,
    required: typeof parameter?.required === 'boolean' ? parameter.required : requiredFallback,
    schema: resolvedSchema,
  };
}

function extractParameters(
  path: string,
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>,
  spec: Record<string, unknown>,
  version: '3.0' | '3.1',
): { pathParams: ParsedParameter[]; queryParams: ParsedParameter[] } {
  const combined = getCombinedParameters(pathItem, operation, spec);
  const pathParameters = new Map<string, Record<string, unknown>>();
  const queryParameters: ParsedParameter[] = [];

  for (const parameter of combined) {
    if (parameter.in === 'path' && typeof parameter.name === 'string') {
      pathParameters.set(parameter.name, parameter);
    }

    if (parameter.in === 'query' && typeof parameter.name === 'string') {
      queryParameters.push(toParsedParameter(parameter, parameter.name, spec, version, false));
    }
  }

  const pathNames = [...new Set([...getPathParameterNames(path), ...pathParameters.keys()])];
  return {
    pathParams: pathNames.map((name) =>
      toParsedParameter(pathParameters.get(name), name, spec, version, true),
    ),
    queryParams: queryParameters,
  };
}

function extractRequestBody(
  operation: Record<string, unknown>,
  spec: Record<string, unknown>,
  version: '3.0' | '3.1',
): ParsedSchema | undefined {
  const requestBody = resolveOpenAPIObject(operation.requestBody, spec);
  const schema = getJsonContentSchema(requestBody);
  return schema ? resolveSchemaForOutput(schema, spec, version) : undefined;
}

function collectComponentSchemas(
  spec: Record<string, unknown>,
  version: '3.0' | '3.1',
): ParsedSchema[] {
  const schemas =
    isRecord(spec.components) && isRecord(spec.components.schemas)
      ? spec.components.schemas
      : undefined;

  if (!schemas) {
    return [];
  }

  return Object.entries(schemas)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([name, schema]) => ({
      ...resolveSchemaForOutput(schema, spec, version),
      name,
    }));
}

function extractSecuritySchemes(spec: Record<string, unknown>): ParsedSecurityScheme[] {
  const components = isRecord(spec.components) ? spec.components : undefined;
  const schemes =
    components && isRecord(components.securitySchemes) ? components.securitySchemes : undefined;

  if (!schemes) return [];

  const result: ParsedSecurityScheme[] = [];
  for (const [name, scheme] of Object.entries(schemes)) {
    if (!isRecord(scheme)) continue;

    const description = typeof scheme.description === 'string' ? scheme.description : undefined;

    if (scheme.type === 'http') {
      if (scheme.scheme === 'bearer') {
        result.push({ type: 'bearer', name, description });
      } else if (scheme.scheme === 'basic') {
        result.push({ type: 'basic', name, description });
      }
    } else if (scheme.type === 'apiKey') {
      const location = scheme.in as 'header' | 'query' | 'cookie';
      const paramName = typeof scheme.name === 'string' ? scheme.name : name;
      result.push({ type: 'apiKey', name, in: location, paramName, description });
    } else if (scheme.type === 'oauth2' && isRecord(scheme.flows)) {
      const flows: ParsedOAuthFlows = {};
      const rawFlows = scheme.flows;

      if (isRecord(rawFlows.authorizationCode)) {
        const ac = rawFlows.authorizationCode;
        flows.authorizationCode = {
          authorizationUrl: String(ac.authorizationUrl ?? ''),
          tokenUrl: String(ac.tokenUrl ?? ''),
          scopes: isRecord(ac.scopes) ? (ac.scopes as Record<string, string>) : {},
        };
      }
      if (isRecord(rawFlows.clientCredentials)) {
        const cc = rawFlows.clientCredentials;
        flows.clientCredentials = {
          tokenUrl: String(cc.tokenUrl ?? ''),
          scopes: isRecord(cc.scopes) ? (cc.scopes as Record<string, string>) : {},
        };
      }

      result.push({ type: 'oauth2', name, flows, description });
    }
  }

  return result;
}

function extractOperationSecurity(
  operation: Record<string, unknown>,
  globalSecurity: unknown[],
): OperationSecurity | undefined {
  // Operation-level security overrides global
  const security = Array.isArray(operation.security) ? operation.security : globalSecurity;
  if (security.length === 0 && !Array.isArray(operation.security)) return undefined;

  const schemes: string[] = [];
  for (const requirement of security) {
    if (isRecord(requirement)) {
      schemes.push(...Object.keys(requirement));
    }
  }

  return {
    required: schemes.length > 0,
    schemes,
  };
}

export function parseOpenAPI(spec: Record<string, unknown>): {
  operations: ParsedOperation[];
  schemas: ParsedSchema[];
  securitySchemes: ParsedSecurityScheme[];
  version: '3.0' | '3.1';
} {
  const version = getVersion(spec);

  if (!isRecord(spec.info)) {
    throw new OpenAPIParserError('OpenAPI spec is missing required field: info');
  }

  if (!isRecord(spec.paths)) {
    throw new OpenAPIParserError('OpenAPI spec is missing required field: paths');
  }

  const globalSecurity = Array.isArray(spec.security) ? spec.security : [];
  const operations: ParsedOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!isRecord(pathItem)) {
      continue;
    }

    for (const method of ['get', 'post', 'put', 'delete', 'patch'] as const) {
      const operation = pathItem[method];
      if (!isRecord(operation)) {
        continue;
      }

      const operationId =
        typeof operation.operationId === 'string' ? operation.operationId : `${method}_${path}`;
      const { pathParams, queryParams } = extractParameters(
        path,
        pathItem,
        operation,
        spec,
        version,
      );
      const successResponse = pickSuccessResponse(operation, spec);
      const security = extractOperationSecurity(operation, globalSecurity);

      const parsed: ParsedOperation = {
        operationId,
        methodName: normalizeOperationId(operationId, method.toUpperCase() as HttpMethod, path),
        method: method.toUpperCase() as HttpMethod,
        path,
        pathParams,
        queryParams,
        requestBody: extractRequestBody(operation, spec, version),
        response: successResponse.schema
          ? resolveSchemaForOutput(successResponse.schema, spec, version)
          : undefined,
        responseStatus: successResponse.status,
        tags: Array.isArray(operation.tags)
          ? operation.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
      };
      if (security) parsed.security = security;

      operations.push(parsed);
    }
  }

  return {
    operations,
    schemas: collectComponentSchemas(spec, version),
    securitySchemes: extractSecuritySchemes(spec),
    version,
  };
}
