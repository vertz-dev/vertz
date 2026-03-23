// Types

// Analyzers
export { ComponentAnalyzer } from './analyzers/component-analyzer';
export type {
  ComponentPropFields,
  PropFieldAccess,
  PropForward,
} from './analyzers/component-prop-field-analyzer';
export { analyzeComponentPropFields } from './analyzers/component-prop-field-analyzer';
export type { CSSCallInfo, CSSCallKind } from './analyzers/css-analyzer';
export { CSSAnalyzer } from './analyzers/css-analyzer';
export type {
  NestedFieldAccess,
  PropFlow,
  QueryFieldSelection,
} from './analyzers/field-selection-analyzer';
export { analyzeFieldSelection } from './analyzers/field-selection-analyzer';
export { JsxAnalyzer } from './analyzers/jsx-analyzer';
export { MutationAnalyzer } from './analyzers/mutation-analyzer';
export { ReactivityAnalyzer } from './analyzers/reactivity-analyzer';
// Pipeline
export { compile, compileForSSRAot } from './compiler';
// CSS Extraction (zero-runtime)
export { CSSCodeSplitter } from './css-extraction/code-splitting';
export { DeadCSSEliminator } from './css-extraction/dead-css';
export type { CSSExtractionResult } from './css-extraction/extractor';
export { CSSExtractor } from './css-extraction/extractor';
export type { CSSHMRUpdateResult } from './css-extraction/hmr';
export { CSSHMRHandler } from './css-extraction/hmr';
export { RouteCSSManifest } from './css-extraction/route-css-manifest';
// Diagnostics
export { CSSDiagnostics } from './diagnostics/css-diagnostics';
export { MutationDiagnostics } from './diagnostics/mutation-diagnostics';
export { PropsDestructuringDiagnostics } from './diagnostics/props-destructuring';
export { SSRSafetyDiagnostics } from './diagnostics/ssr-safety-diagnostics';
export type { VertzLibraryPluginOptions } from './library-plugin';
// Library compilation plugin
export { createVertzLibraryPlugin } from './library-plugin';
export type { GenerateManifestsOptions, ManifestMap, ManifestWarning } from './manifest-resolver';
// Manifest generation (cross-file reactivity analysis)
export {
  generateAllManifests,
  regenerateFileManifest,
  resolveModuleSpecifier,
} from './manifest-resolver';
// Prefetch manifest (SSR single-pass static analysis)
export type {
  ComponentAnalysis,
  ExtractedQuery,
  ExtractedRoute,
  GeneratePrefetchManifestOptions,
  ManifestRoute,
  PrefetchManifest,
  QueryBindings,
} from './prefetch-manifest';
export {
  analyzeComponentQueries,
  collectImports,
  extractRoutes,
  generatePrefetchManifest,
} from './prefetch-manifest';
// Reactivity manifest
export { loadFrameworkManifest, loadManifestFromJson } from './reactivity-manifest';
// Transformers
export { AotStringTransformer } from './transformers/aot-string-transformer';
export { ComputedTransformer } from './transformers/computed-transformer';
export type { CSSTransformResult } from './transformers/css-transformer';
export { CSSTransformer } from './transformers/css-transformer';
export { HydrationTransformer } from './transformers/hydration-transformer';
export { JsxTransformer } from './transformers/jsx-transformer';
export { MutationTransformer } from './transformers/mutation-transformer';
export { PropTransformer } from './transformers/prop-transformer';
export type {
  RouteSplittingDiagnostic,
  RouteSplittingResult,
  RouteSplittingSkipped,
} from './transformers/route-splitting-transformer';
export { transformRouteSplitting } from './transformers/route-splitting-transformer';
export { SignalTransformer } from './transformers/signal-transformer';
// Type Generation
export type { CSSPropertiesInput } from './type-generation/css-properties';
export { generateCSSProperties } from './type-generation/css-properties';
export type { ThemeTypeInput } from './type-generation/theme-types';
export { generateThemeTypes } from './type-generation/theme-types';
export type {
  AotCompileOutput,
  AotComponentInfo,
  AotTier,
  CompileOptions,
  CompileOutput,
  CompilerDiagnostic,
  ComponentInfo,
  DiagnosticSeverity,
  ExportReactivityInfo,
  JsxExpressionInfo,
  LoadedExportReactivityInfo,
  LoadedReactivityManifest,
  LoadedReactivityShape,
  MutationInfo,
  MutationKind,
  ReactivityKind,
  ReactivityManifest,
  ReactivityShape,
  VariableInfo,
} from './types';
// Note: Vite plugin has been removed. Use the Bun plugin from @vertz/ui-server/bun-plugin.
