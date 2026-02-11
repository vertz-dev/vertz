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
// Diagnostics
export { CSSDiagnostics } from './diagnostics/css-diagnostics';
export { MutationDiagnostics } from './diagnostics/mutation-diagnostics';
export { PropsDestructuringDiagnostics } from './diagnostics/props-destructuring';
export { ComputedTransformer } from './transformers/computed-transformer';
export type { CSSTransformResult } from './transformers/css-transformer';
export { CSSTransformer } from './transformers/css-transformer';
export { JsxTransformer } from './transformers/jsx-transformer';
export { MutationTransformer } from './transformers/mutation-transformer';
export { PropTransformer } from './transformers/prop-transformer';
// Transformers
export { SignalTransformer } from './transformers/signal-transformer';
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

// Vite Plugin
export { default } from './vite-plugin';
