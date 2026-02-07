// IR types
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

// IR builders
export {
  addDiagnosticsToIR,
  createEmptyAppIR,
  createEmptyDependencyGraph,
} from './ir/builder';

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

// Base classes
export type { Analyzer } from './analyzers/base-analyzer';
export { BaseAnalyzer } from './analyzers/base-analyzer';
export type { Generator } from './generators/base-generator';
export { BaseGenerator } from './generators/base-generator';

// Compiler
export type { CompileResult, CompilerDependencies, Validator } from './compiler';
export { Compiler } from './compiler';

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

// Env analyzer
export type { EnvAnalyzerResult } from './analyzers/env-analyzer';
export { EnvAnalyzer } from './analyzers/env-analyzer';

// Module analyzer
export type { ModuleAnalyzerResult } from './analyzers/module-analyzer';
export { extractIdentifierNames, ModuleAnalyzer, parseImports } from './analyzers/module-analyzer';

// Service analyzer
export type { ServiceAnalyzerResult } from './analyzers/service-analyzer';
export { extractMethodSignatures, parseInjectRefs, ServiceAnalyzer } from './analyzers/service-analyzer';

// Middleware analyzer
export type { MiddlewareAnalyzerResult } from './analyzers/middleware-analyzer';
export { MiddlewareAnalyzer } from './analyzers/middleware-analyzer';

// Schema executor
export type { SchemaExecutionResult, SchemaExecutor } from './utils/schema-executor';
export { createSchemaExecutor } from './utils/schema-executor';
