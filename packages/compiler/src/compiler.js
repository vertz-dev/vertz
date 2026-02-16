import { Project } from 'ts-morph';
import { AppAnalyzer } from './analyzers/app-analyzer';
import { DependencyGraphAnalyzer } from './analyzers/dependency-graph-analyzer';
import { EnvAnalyzer } from './analyzers/env-analyzer';
import { MiddlewareAnalyzer } from './analyzers/middleware-analyzer';
import { ModuleAnalyzer } from './analyzers/module-analyzer';
import { SchemaAnalyzer } from './analyzers/schema-analyzer';
import { resolveConfig } from './config';
import { hasErrors } from './errors';
import { BootGenerator } from './generators/boot-generator';
import { ManifestGenerator } from './generators/manifest-generator';
import { OpenAPIGenerator } from './generators/openapi-generator';
import { RouteTableGenerator } from './generators/route-table-generator';
import { SchemaRegistryGenerator } from './generators/schema-registry-generator';
import { createEmptyAppIR, enrichSchemasWithModuleNames } from './ir/builder';
import { CompletenessValidator } from './validators/completeness-validator';
import { ModuleValidator } from './validators/module-validator';
import { NamingValidator } from './validators/naming-validator';
import { PlacementValidator } from './validators/placement-validator';
export class Compiler {
  config;
  deps;
  constructor(config, dependencies) {
    this.config = config;
    this.deps = dependencies;
  }
  getConfig() {
    return this.config;
  }
  async analyze() {
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
    return enrichSchemasWithModuleNames(ir);
  }
  async validate(ir) {
    const allDiagnostics = [];
    for (const validator of this.deps.validators) {
      const diagnostics = await validator.validate(ir);
      allDiagnostics.push(...diagnostics);
    }
    return allDiagnostics;
  }
  async generate(ir) {
    const outputDir = this.config.compiler.outputDir;
    await Promise.all(this.deps.generators.map((g) => g.generate(ir, outputDir)));
  }
  async compile() {
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
export function createCompiler(config) {
  const resolved = resolveConfig(config);
  const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
  const deps = {
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
//# sourceMappingURL=compiler.js.map
