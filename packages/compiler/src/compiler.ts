import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Project } from 'ts-morph';
import type { AccessAnalyzerResult } from './analyzers/access-analyzer';
import { AccessAnalyzer } from './analyzers/access-analyzer';
import type { AppAnalyzerResult } from './analyzers/app-analyzer';
import { AppAnalyzer } from './analyzers/app-analyzer';
import type { AuthAnalyzerResult } from './analyzers/auth-analyzer';
import { AuthAnalyzer } from './analyzers/auth-analyzer';
import type { Analyzer } from './analyzers/base-analyzer';
import type { DatabaseAnalyzerResult } from './analyzers/database-analyzer';
import { DatabaseAnalyzer } from './analyzers/database-analyzer';
import type { DependencyGraphResult } from './analyzers/dependency-graph-analyzer';
import { DependencyGraphAnalyzer } from './analyzers/dependency-graph-analyzer';
import type { EntityAnalyzerResult } from './analyzers/entity-analyzer';
import { EntityAnalyzer } from './analyzers/entity-analyzer';
import type { EnvAnalyzerResult } from './analyzers/env-analyzer';
import { EnvAnalyzer } from './analyzers/env-analyzer';
import type { MiddlewareAnalyzerResult } from './analyzers/middleware-analyzer';
import { MiddlewareAnalyzer } from './analyzers/middleware-analyzer';
import type { ModuleAnalyzerResult } from './analyzers/module-analyzer';
import { ModuleAnalyzer } from './analyzers/module-analyzer';
import type { SchemaAnalyzerResult } from './analyzers/schema-analyzer';
import { SchemaAnalyzer } from './analyzers/schema-analyzer';
import type { ServiceAnalyzerResult } from './analyzers/service-analyzer';
import { ServiceAnalyzer } from './analyzers/service-analyzer';
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
import { createEmptyAppIR, enrichSchemasWithModuleNames } from './ir/builder';
import { detectRouteCollisions, injectEntityRoutes } from './ir/entity-route-injector';
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
    entity: Analyzer<EntityAnalyzerResult>;
    service: Analyzer<ServiceAnalyzerResult>;
    database: Analyzer<DatabaseAnalyzerResult>;
    access: Analyzer<AccessAnalyzerResult>;
    auth: Analyzer<AuthAnalyzerResult>;
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
    const entityResult = await analyzers.entity.analyze();
    const serviceResult = await analyzers.service.analyze();
    const databaseResult = await analyzers.database.analyze();
    const accessResult = await analyzers.access.analyze();
    const authResult = await analyzers.auth.analyze();
    const depGraphResult = await analyzers.dependencyGraph.analyze();

    ir.env = envResult.env;
    ir.schemas = schemaResult.schemas;
    ir.modules = moduleResult.modules;
    ir.middleware = middlewareResult.middleware;
    ir.app = appResult.app;
    ir.entities = entityResult.entities;
    ir.services = serviceResult.services;
    ir.databases = databaseResult.databases;
    ir.access = accessResult.access;
    ir.auth = authResult.auth;
    ir.dependencyGraph = depGraphResult.graph;

    // Collect diagnostics from all analyzers
    ir.diagnostics.push(
      ...analyzers.env.getDiagnostics(),
      ...analyzers.schema.getDiagnostics(),
      ...analyzers.middleware.getDiagnostics(),
      ...analyzers.module.getDiagnostics(),
      ...analyzers.app.getDiagnostics(),
      ...analyzers.entity.getDiagnostics(),
      ...analyzers.service.getDiagnostics(),
      ...analyzers.database.getDiagnostics(),
      ...analyzers.access.getDiagnostics(),
      ...analyzers.auth.getDiagnostics(),
      ...analyzers.dependencyGraph.getDiagnostics(),
    );

    // Inject entity routes into synthetic module for OpenAPI/route-table
    injectEntityRoutes(ir);

    // Check for collisions
    const collisionDiags = detectRouteCollisions(ir);
    ir.diagnostics.push(...collisionDiags);

    return enrichSchemasWithModuleNames(ir);
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
    await mkdir(resolve(outputDir), { recursive: true });
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
      entity: new EntityAnalyzer(project, resolved),
      service: new ServiceAnalyzer(project, resolved),
      database: new DatabaseAnalyzer(project, resolved),
      access: new AccessAnalyzer(project, resolved),
      auth: new AuthAnalyzer(project, resolved),
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
