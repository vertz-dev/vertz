import { Project } from 'ts-morph';
import type { AppAnalyzerResult } from './analyzers/app-analyzer';
import { AppAnalyzer } from './analyzers/app-analyzer';
import type { Analyzer } from './analyzers/base-analyzer';
import type { DependencyGraphResult } from './analyzers/dependency-graph-analyzer';
import { DependencyGraphAnalyzer } from './analyzers/dependency-graph-analyzer';
import type { EnvAnalyzerResult } from './analyzers/env-analyzer';
import { EnvAnalyzer } from './analyzers/env-analyzer';
import type { MiddlewareAnalyzerResult } from './analyzers/middleware-analyzer';
import { MiddlewareAnalyzer } from './analyzers/middleware-analyzer';
import type { ModuleAnalyzerResult } from './analyzers/module-analyzer';
import { ModuleAnalyzer } from './analyzers/module-analyzer';
import type { SchemaAnalyzerResult } from './analyzers/schema-analyzer';
import { SchemaAnalyzer } from './analyzers/schema-analyzer';
import type { ResolvedConfig, VertzConfig } from './config';
import { resolveConfig } from './config';
import type { Diagnostic } from './errors';
import { hasErrors } from './errors';
import type { Generator } from './generators/base-generator';
import { BootGenerator } from './generators/boot-generator';
import { ManifestGenerator } from './generators/manifest-generator';
import { OpenAPIGenerator } from './generators/openapi-generator';
import { RouteTableGenerator } from './generators/route-table-generator';
import { SchemaRegistryGenerator } from './generators/schema-registry-generator';
import { createEmptyAppIR } from './ir/builder';
import type { AppIR } from './ir/types';
import { CompletenessValidator } from './validators/completeness-validator';
import { ModuleValidator } from './validators/module-validator';
import { NamingValidator } from './validators/naming-validator';
import { PlacementValidator } from './validators/placement-validator';

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
    const envResult = await analyzers.env.analyze();
    const schemaResult = await analyzers.schema.analyze();
    const moduleResult = await analyzers.module.analyze();
    const middlewareResult = await analyzers.middleware.analyze();
    const appResult = await analyzers.app.analyze();
    const depGraphResult = await analyzers.dependencyGraph.analyze();

    ir.env = envResult.env;
    ir.schemas = schemaResult.schemas;
    ir.modules = moduleResult.modules;
    ir.middleware = middlewareResult.middleware;
    ir.app = appResult.app;
    ir.dependencyGraph = depGraphResult.graph;

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

export function createCompiler(config?: VertzConfig): Compiler {
  const resolved = resolveConfig(config);
  const project = new Project({ tsConfigFilePath: 'tsconfig.json' });

  const deps: CompilerDependencies = {
    analyzers: {
      env: new EnvAnalyzer(project, resolved),
      schema: new SchemaAnalyzer(project, resolved),
      middleware: new MiddlewareAnalyzer(project, resolved),
      module: new ModuleAnalyzer(project, resolved),
      app: new AppAnalyzer(project, resolved),
      dependencyGraph: new DependencyGraphAnalyzer(project, resolved),
    },
    validators: [
      new CompletenessValidator(),
      new ModuleValidator(),
      new NamingValidator(),
      new PlacementValidator(),
    ],
    generators: [
      new BootGenerator(resolved),
      new RouteTableGenerator(resolved),
      new SchemaRegistryGenerator(resolved),
      new ManifestGenerator(resolved),
      new OpenAPIGenerator(resolved),
    ],
  };

  return new Compiler(resolved, deps);
}
