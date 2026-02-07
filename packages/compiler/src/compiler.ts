import type { ResolvedConfig } from './config';
import type { Diagnostic } from './errors';
import { hasErrors } from './errors';
import type { Analyzer } from './analyzers/base-analyzer';
import type { Generator } from './generators/base-generator';
import type { AppIR } from './ir/types';
import { createEmptyAppIR } from './ir/builder';

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

  async compile(): Promise<CompileResult> {
    const ir = createEmptyAppIR();

    // 1. Run all analyzers
    const { analyzers } = this.deps;
    await analyzers.env.analyze();
    await analyzers.schema.analyze();
    await analyzers.module.analyze();
    await analyzers.middleware.analyze();
    await analyzers.app.analyze();
    await analyzers.dependencyGraph.analyze();

    // 2. Run all validators
    const allDiagnostics: Diagnostic[] = [];
    for (const validator of this.deps.validators) {
      const diagnostics = await validator.validate(ir);
      allDiagnostics.push(...diagnostics);
    }

    // 3. If errors and not forcing generation, skip generators
    const hasErrorDiags = hasErrors(allDiagnostics);
    if (!hasErrorDiags || this.config.forceGenerate) {
      // 4. Run all generators in parallel
      const outputDir = this.config.compiler.outputDir;
      await Promise.all(this.deps.generators.map((g) => g.generate(ir, outputDir)));
    }

    return {
      success: !hasErrorDiags,
      ir: { ...ir, diagnostics: allDiagnostics },
      diagnostics: allDiagnostics,
    };
  }
}
