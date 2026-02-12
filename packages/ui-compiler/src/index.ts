// Types

// Analyzers
export { ComponentAnalyzer } from './analyzers/component-analyzer';
export type { CSSCallInfo, CSSCallKind } from './analyzers/css-analyzer';
export { CSSAnalyzer } from './analyzers/css-analyzer';
export { JsxAnalyzer } from './analyzers/jsx-analyzer';
export { MutationAnalyzer } from './analyzers/mutation-analyzer';
export { ReactivityAnalyzer } from './analyzers/reactivity-analyzer';
// Pipeline
export { compile } from './compiler';
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
export { ComputedTransformer } from './transformers/computed-transformer';
export type { CSSTransformResult } from './transformers/css-transformer';
export { CSSTransformer } from './transformers/css-transformer';
export { HydrationTransformer } from './transformers/hydration-transformer';
export { JsxTransformer } from './transformers/jsx-transformer';
export { MutationTransformer } from './transformers/mutation-transformer';
export { PropTransformer } from './transformers/prop-transformer';
// Transformers
export { SignalTransformer } from './transformers/signal-transformer';
// Type Generation
export type { CSSPropertiesInput } from './type-generation/css-properties';
export { generateCSSProperties } from './type-generation/css-properties';
export type { ThemeTypeInput } from './type-generation/theme-types';
export { generateThemeTypes } from './type-generation/theme-types';
export type {
  CompileOutput,
  CompilerDiagnostic,
  ComponentInfo,
  DiagnosticSeverity,
  JsxExpressionInfo,
  MutationInfo,
  MutationKind,
  ReactivityKind,
  VariableInfo,
} from './types';
export type { VertzPluginOptions } from './vite-plugin';
// Vite Plugin
export { default } from './vite-plugin';
