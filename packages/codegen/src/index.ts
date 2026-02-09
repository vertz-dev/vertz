export { adaptIR } from './ir-adapter';
export type { ConversionContext, ConversionResult } from './json-schema-converter';
export { jsonSchemaToTS } from './json-schema-converter';
export type {
  CodegenAuth,
  CodegenAuthScheme,
  CodegenIR,
  CodegenModule,
  CodegenOperation,
  CodegenSchema,
  FileFragment,
  GeneratedFile,
  Generator,
  GeneratorConfig,
  HttpMethod,
  Import,
  JsonSchema,
  OAuthFlows,
  OperationAuth,
  OperationSchemaRefs,
  SchemaAnnotations,
  SchemaNamingParts,
  StreamingConfig,
} from './types';
export { mergeImports, renderImports } from './utils/imports';
export { toCamelCase, toKebabCase, toPascalCase, toSnakeCase } from './utils/naming';
