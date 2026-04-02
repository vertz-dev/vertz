export { groupOperations } from './adapter/resource-grouper';
export { sanitizeIdentifier } from './adapter/identifier';
export { generateAll } from './generators/index';
export { generateClient } from './generators/client-generator';
export { generateInterface, jsonSchemaToTS } from './generators/json-schema-to-ts';
export { jsonSchemaToZod } from './generators/json-schema-to-zod';
export { generateResources } from './generators/resource-generator';
export { generateSchemas } from './generators/schema-generator';
export { generateTypes } from './generators/types-generator';
export { normalizeOperationId } from './parser/operation-id-normalizer';
export { parseOpenAPI } from './parser/openapi-parser';
export { resolveRef, resolveSchema } from './parser/ref-resolver';
export type { GroupByStrategy } from './adapter/resource-grouper';
export type { GeneratedFile, GenerateOptions } from './generators/types';
export type { NormalizerConfig } from './parser/operation-id-normalizer';
export type { ResolveOptions } from './parser/ref-resolver';
export type {
  HttpMethod,
  ParsedOperation,
  ParsedParameter,
  ParsedResource,
  ParsedSchema,
  ParsedSpec,
} from './parser/types';
