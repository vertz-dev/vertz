// IR types
export { AppAnalyzer } from './analyzers/app-analyzer';
export { BaseAnalyzer } from './analyzers/base-analyzer';
export { DependencyGraphAnalyzer } from './analyzers/dependency-graph-analyzer';
export { EnvAnalyzer } from './analyzers/env-analyzer';
export { MiddlewareAnalyzer } from './analyzers/middleware-analyzer';
export { extractIdentifierNames, ModuleAnalyzer, parseImports } from './analyzers/module-analyzer';
export { RouteAnalyzer } from './analyzers/route-analyzer';
export {
  createInlineSchemaRef,
  createNamedSchemaRef,
  extractSchemaId,
  isSchemaExpression,
  isSchemaFile,
  parseSchemaName,
  SchemaAnalyzer,
} from './analyzers/schema-analyzer';
export {
  extractMethodSignatures,
  parseInjectRefs,
  ServiceAnalyzer,
} from './analyzers/service-analyzer';
export { Compiler, createCompiler } from './compiler';
export { defineConfig, resolveConfig } from './config';
export {
  createDiagnostic,
  createDiagnosticFromLocation,
  filterBySeverity,
  hasErrors,
  mergeDiagnostics,
} from './errors';
export { BaseGenerator } from './generators/base-generator';
export {
  BootGenerator,
  buildBootManifest,
  renderBootFile,
  resolveImportPath,
} from './generators/boot-generator';
export { buildManifest, ManifestGenerator } from './generators/manifest-generator';
export { OpenAPIGenerator } from './generators/openapi-generator';
export {
  buildRouteTable,
  RouteTableGenerator,
  renderRouteTableFile,
} from './generators/route-table-generator';
export {
  buildSchemaRegistry,
  renderSchemaRegistryFile,
  SchemaRegistryGenerator,
} from './generators/schema-registry-generator';
export { categorizeChanges, findAffectedModules, IncrementalCompiler } from './incremental';
// IR builders
export { addDiagnosticsToIR, createEmptyAppIR, createEmptyDependencyGraph } from './ir/builder';
// IR merge
export { mergeIR } from './ir/merge';
export { parseTscOutput, parseWatchBlock, typecheck, typecheckWatch } from './typecheck';
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
export { isFromImport, resolveExport, resolveIdentifier } from './utils/import-resolver';
export { createSchemaExecutor } from './utils/schema-executor';
export { CompletenessValidator } from './validators/completeness-validator';
export { ModuleValidator } from './validators/module-validator';
export { NamingValidator } from './validators/naming-validator';
export { PlacementValidator } from './validators/placement-validator';
//# sourceMappingURL=index.js.map
