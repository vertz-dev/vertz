import type { AppAnalyzerResult } from './analyzers/app-analyzer';
import type { Analyzer } from './analyzers/base-analyzer';
import type { DependencyGraphResult } from './analyzers/dependency-graph-analyzer';
import type { EnvAnalyzerResult } from './analyzers/env-analyzer';
import type { MiddlewareAnalyzerResult } from './analyzers/middleware-analyzer';
import type { ModuleAnalyzerResult } from './analyzers/module-analyzer';
import type { SchemaAnalyzerResult } from './analyzers/schema-analyzer';
import type { ResolvedConfig, VertzConfig } from './config';
import type { Diagnostic } from './errors';
import type { Generator } from './generators/base-generator';
import type { AppIR } from './ir/types';
export interface Validator {
  validate(ir: AppIR): Promise<Diagnostic[]>;
}
export interface CompileResult {
  success: boolean;
  ir: AppIR;
  diagnostics: Diagnostic[];
}
export interface CompilerDependencies {
  analyzers: {
    env: Analyzer<EnvAnalyzerResult>;
    schema: Analyzer<SchemaAnalyzerResult>;
    middleware: Analyzer<MiddlewareAnalyzerResult>;
    module: Analyzer<ModuleAnalyzerResult>;
    app: Analyzer<AppAnalyzerResult>;
    dependencyGraph: Analyzer<DependencyGraphResult>;
  };
  validators: Validator[];
  generators: Generator[];
}
export declare class Compiler {
  private readonly config;
  private readonly deps;
  constructor(config: ResolvedConfig, dependencies: CompilerDependencies);
  getConfig(): ResolvedConfig;
  analyze(): Promise<AppIR>;
  validate(ir: AppIR): Promise<Diagnostic[]>;
  generate(ir: AppIR): Promise<void>;
  compile(): Promise<CompileResult>;
}
export declare function createCompiler(config?: VertzConfig): Compiler;
//# sourceMappingURL=compiler.d.ts.map
