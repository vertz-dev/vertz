import type { Analyzer } from './analyzers/base-analyzer';
import type { ResolvedConfig } from './config';
import type { Diagnostic } from './errors';
import { hasErrors } from './errors';
import type { Generator } from './generators/base-generator';
import { createEmptyAppIR } from './ir/builder';
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
    env: Analyzer<unknown>;
    schema: Analyzer<unknown>;
    middleware: Analyzer<unknown>;
    module: Analyzer<unknown>;
    app: Analyzer<unknown>;
    dependencyGraph: Analyzer<unknown>;
  };
  validators: Validator[];
  generators: Generator[];
}

export class Compiler {
  private readonly config: ResolvedConfig;
  private readonly deps: CompilerDependencies;

  constructor(config: ResolvedConfig, dependencies: CompilerDependencies) {
    this.config = config;
    this.deps = dependencies;
  }

  getConfig(): ResolvedConfig {
    return this.config;
  }

  async analyze(): Promise<AppIR> {
    const ir = createEmptyAppIR();

    const { analyzers } = this.deps;
    await analyzers.env.analyze();
    await analyzers.schema.analyze();
    await analyzers.module.analyze();
    await analyzers.middleware.analyze();
    await analyzers.app.analyze();
    await analyzers.dependencyGraph.analyze();

    return ir;
  }

  async validate(ir: AppIR): Promise<Diagnostic[]> {
    const allDiagnostics: Diagnostic[] = [];
    for (const validator of this.deps.validators) {
      const diagnostics = await validator.validate(ir);
      allDiagnostics.push(...diagnostics);
    }
    return allDiagnostics;
  }

  async generate(ir: AppIR): Promise<void> {
    const outputDir = this.config.compiler.outputDir;
    await Promise.all(this.deps.generators.map((g) => g.generate(ir, outputDir)));
  }

  async compile(): Promise<CompileResult> {
    const ir = await this.analyze();
    const diagnostics = await this.validate(ir);
    const hasErrorDiags = hasErrors(diagnostics);

    if (!hasErrorDiags || this.config.forceGenerate) {
      await this.generate(ir);
    }

    return {
      success: !hasErrorDiags,
      ir: { ...ir, diagnostics },
      diagnostics,
    };
  }
}
