// IR types

// App analyzer
export type { AppAnalyzerResult } from './analyzers/app-analyzer';
export { AppAnalyzer } from './analyzers/app-analyzer';
// Base classes
export type { Analyzer } from './analyzers/base-analyzer';
export { BaseAnalyzer } from './analyzers/base-analyzer';
// Dependency graph analyzer
export type {
  DependencyGraphInput,
  DependencyGraphResult,
} from './analyzers/dependency-graph-analyzer';
export { DependencyGraphAnalyzer } from './analyzers/dependency-graph-analyzer';
// Env analyzer
export type { EnvAnalyzerResult } from './analyzers/env-analyzer';
export { EnvAnalyzer } from './analyzers/env-analyzer';
// Middleware analyzer
export type { MiddlewareAnalyzerResult } from './analyzers/middleware-analyzer';
export { MiddlewareAnalyzer } from './analyzers/middleware-analyzer';
// Module analyzer
export type { ModuleAnalyzerResult } from './analyzers/module-analyzer';
export { extractIdentifierNames, ModuleAnalyzer, parseImports } from './analyzers/module-analyzer';
// Route analyzer
export type { RouteAnalyzerResult } from './analyzers/route-analyzer';
export { RouteAnalyzer } from './analyzers/route-analyzer';
// Schema analyzer
export type { SchemaAnalyzerResult } from './analyzers/schema-analyzer';
export {
  createInlineSchemaRef,
  createNamedSchemaRef,
  extractSchemaId,
  isSchemaExpression,
  isSchemaFile,
  parseSchemaName,
  SchemaAnalyzer,
} from './analyzers/schema-analyzer';
// Service analyzer
export type { ServiceAnalyzerResult } from './analyzers/service-analyzer';
export {
  extractMethodSignatures,
  parseInjectRefs,
  ServiceAnalyzer,
} from './analyzers/service-analyzer';
// Compiler
export type { CompileResult, CompilerDependencies, Validator } from './compiler';
export { Compiler } from './compiler';
// Config
export type {
  CompilerConfig,
  OpenAPIConfig,
  ResolvedConfig,
  SchemaConfig,
  ValidationConfig,
  VertzConfig,
} from './config';
export { defineConfig, resolveConfig } from './config';
// Diagnostics
export type {
  CreateDiagnosticOptions,
  Diagnostic,
  DiagnosticCode,
  DiagnosticSeverity,
  SourceContext,
} from './errors';
export {
  createDiagnostic,
  createDiagnosticFromLocation,
  filterBySeverity,
  hasErrors,
  mergeDiagnostics,
} from './errors';
export type { Generator } from './generators/base-generator';
export { BaseGenerator } from './generators/base-generator';
// Boot generator
export type {
  BootManifest,
  BootMiddlewareEntry,
  BootModuleEntry,
} from './generators/boot-generator';
export {
  BootGenerator,
  buildBootManifest,
  renderBootFile,
  resolveImportPath,
} from './generators/boot-generator';
// Manifest generator
export type {
  AppManifest,
  ManifestDependencyEdge,
  ManifestDiagnostic,
  ManifestMiddleware,
  ManifestModule,
  ManifestRoute,
} from './generators/manifest-generator';
export { buildManifest, ManifestGenerator } from './generators/manifest-generator';
export type {
  JSONSchemaObject,
  OpenAPIDocument,
  OpenAPIInfo,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIPathItem,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPIServer,
  OpenAPITag,
} from './generators/openapi-generator';
export { OpenAPIGenerator } from './generators/openapi-generator';
// Route table generator
export type {
  RouteTableEntry,
  RouteTableManifest,
  RouteTableSchemas,
} from './generators/route-table-generator';
export {
  buildRouteTable,
  RouteTableGenerator,
  renderRouteTableFile,
} from './generators/route-table-generator';
// Schema registry generator
export type {
  SchemaRegistryEntry,
  SchemaRegistryManifest,
} from './generators/schema-registry-generator';
export {
  buildSchemaRegistry,
  renderSchemaRegistryFile,
  SchemaRegistryGenerator,
} from './generators/schema-registry-generator';
// Incremental compiler
export type {
  CategorizedChanges,
  CategorizeOptions,
  FileCategory,
  FileChange,
  IncrementalResult,
} from './incremental';
export { categorizeChanges, IncrementalCompiler } from './incremental';
// IR builders
export {
  addDiagnosticsToIR,
  createEmptyAppIR,
  createEmptyDependencyGraph,
} from './ir/builder';
// IR merge
export { mergeIR } from './ir/merge';
export type {
  AppDefinition,
  AppIR,
  DependencyEdge,
  DependencyEdgeKind,
  DependencyGraphIR,
  DependencyNode,
  DependencyNodeKind,
  EnvIR,
  EnvVariableIR,
  HttpMethod,
  ImportRef,
  InjectRef,
  InlineSchemaRef,
  MiddlewareIR,
  MiddlewareRef,
  ModuleDefContext,
  ModuleIR,
  ModuleRegistration,
  NamedSchemaRef,
  RouteIR,
  RouterIR,
  SchemaIR,
  SchemaNameParts,
  SchemaRef,
  ServiceIR,
  ServiceMethodIR,
  ServiceMethodParam,
  SourceLocation,
} from './ir/types';
// Typecheck
export type { TypecheckDiagnostic, TypecheckOptions, TypecheckResult } from './typecheck';
export { parseTscOutput, typecheck } from './typecheck';
// AST helpers
export {
  extractObjectLiteral,
  findCallExpressions,
  findMethodCallsOnVariable,
  getArrayElements,
  getBooleanValue,
  getNumberValue,
  getProperties,
  getPropertyValue,
  getSourceLocation,
  getStringValue,
  getVariableNameForCall,
} from './utils/ast-helpers';
// Import resolver
export type { ResolvedImport } from './utils/import-resolver';
export { isFromImport, resolveExport, resolveIdentifier } from './utils/import-resolver';
// Schema executor
export type { SchemaExecutionResult, SchemaExecutor } from './utils/schema-executor';
export { createSchemaExecutor } from './utils/schema-executor';
export { CompletenessValidator } from './validators/completeness-validator';
export { ModuleValidator } from './validators/module-validator';
// Validators
export type { ParsedSchemaName, ValidOperation, ValidPart } from './validators/naming-validator';
export { NamingValidator } from './validators/naming-validator';
export { PlacementValidator } from './validators/placement-validator';
