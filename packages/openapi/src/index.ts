export { groupOperations } from './adapter/resource-grouper';
export { sanitizeIdentifier } from './adapter/identifier';
export { normalizeOperationId } from './parser/operation-id-normalizer';
export { parseOpenAPI } from './parser/openapi-parser';
export { resolveRef, resolveSchema } from './parser/ref-resolver';
export type { GroupByStrategy } from './adapter/resource-grouper';
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
