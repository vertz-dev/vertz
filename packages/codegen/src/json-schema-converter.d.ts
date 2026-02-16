import type { JsonSchema } from './types';
export interface ConversionContext {
  namedTypes: Map<string, string>;
  resolving: Set<string>;
}
export interface ConversionResult {
  type: string;
  extractedTypes: Map<string, string>;
}
export declare function jsonSchemaToTS(
  schema: JsonSchema,
  ctx?: ConversionContext,
): ConversionResult;
//# sourceMappingURL=json-schema-converter.d.ts.map
