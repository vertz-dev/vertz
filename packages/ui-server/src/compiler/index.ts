export {
  compile,
  compileForSsrAot,
  loadNativeCompiler,
  tryLoadNativeCompiler,
} from './native-compiler';
export type {
  AotCompileOptions,
  AotCompileResult,
  AotComponentInfo,
  ManifestEntry,
  NativeCompileOptions,
  NativeCompileResult,
  NativeCompiler,
  NativeComponentInfo,
  NativeExtractedQuery,
  NativeExtractedRoute,
  NativeFieldSelection,
  NativeVariableInfo,
} from './native-compiler';

// ─── Library Plugin ─────────────────────────────────────────────
export { createVertzLibraryPlugin } from './library-plugin';
export type { VertzLibraryPluginOptions } from './library-plugin';

// ─── Types ──────────────────────────────────────────────────────
export type {
  AotCompileOutput,
  AotTier,
  CallbackConstInline,
  CompileOptions,
  CompileOutput,
  CompilerDiagnostic,
  ComponentInfo,
  DestructuredPropsInfo,
  DiagnosticSeverity,
  ExportReactivityInfo,
  JsxExpressionInfo,
  LoadedExportReactivityInfo,
  LoadedReactivityManifest,
  LoadedReactivityShape,
  MutationInfo,
  MutationKind,
  PropsBindingInfo,
  ReactivityKind,
  ReactivityManifest,
  ReactivityShape,
  VariableInfo,
} from './types';

// ─── Signal API Registry ────────────────────────────────────────
export {
  getSignalApiConfig,
  isReactiveSourceApi,
  isSignalApi,
  REACTIVE_SOURCE_APIS,
  SIGNAL_API_REGISTRY,
} from './signal-api-registry';
export type { SignalApiConfig } from './signal-api-registry';

// ─── Manifest Generator ────────────────────────────────────────
export { analyzeFile } from './manifest-generator';
export type { FileAnalysis, ImportRef, ReExportRef } from './manifest-generator';

// ─── Manifest Resolver ─────────────────────────────────────────
export {
  generateAllManifests,
  regenerateFileManifest,
  resolveModuleSpecifier,
} from './manifest-resolver';
export type { GenerateManifestsOptions, ManifestMap, ManifestWarning } from './manifest-resolver';

// ─── Reactivity Manifest ───────────────────────────────────────
export { loadFrameworkManifest, loadManifestFromJson } from './reactivity-manifest';

// ─── Prefetch Manifest ─────────────────────────────────────────
export {
  analyzeComponentQueries,
  collectImports,
  extractRoutes,
  generatePrefetchManifest,
} from './prefetch-manifest';
export type {
  ComponentAnalysis,
  ExtractedQuery,
  ExtractedRoute,
  GeneratePrefetchManifestOptions,
  ImportInfo,
  ManifestRoute,
  PrefetchManifest,
  QueryBindings,
} from './prefetch-manifest';

// ─── Field Selection Analyzer ──────────────────────────────────
export { analyzeFieldSelection } from './field-selection-analyzer';
export type {
  InjectionKind,
  NestedFieldAccess,
  PropFlow,
  QueryFieldSelection,
} from './field-selection-analyzer';

// ─── Component Prop Field Analyzer ─────────────────────────────
export { analyzeComponentPropFields } from './component-prop-field-analyzer';
export type {
  ComponentPropFields,
  PropFieldAccess,
  PropForward,
} from './component-prop-field-analyzer';

// ─── CSS Utilities ─────────────────────────────────────────────
export { CSSCodeSplitter } from './css/code-splitting';
export { DeadCSSEliminator } from './css/dead-css';
export { CSSHMRHandler } from './css/hmr';
export type { CSSHMRUpdateResult } from './css/hmr';
export { RouteCSSManifest } from './css/route-css-manifest';
export type { CSSExtractionResult } from './css/types';

// ─── Type Generation ───────────────────────────────────────────
export { generateCSSProperties } from './type-generation/css-properties';
export type { CSSPropertiesInput } from './type-generation/css-properties';
export { generateThemeTypes } from './type-generation/theme-types';
export type { ThemeTypeInput } from './type-generation/theme-types';
