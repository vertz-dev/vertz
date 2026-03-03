# @vertz/compiler — Internals

Architecture and extension points for framework contributors.

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **TypeScript** 5.0+

## Pipeline Overview

The compiler runs in three stages:

```
  Source Code (*.ts)
       ↓
  [Analyzers] → AppIR (Intermediate Representation)
       ↓
  [Validators] → Diagnostics (errors/warnings)
       ↓
  [Generators] → Artifacts (boot.ts, manifest.json, openapi.json)
```

## Programmatic Usage

```typescript
import { createCompiler } from '@vertz/compiler';

const compiler = createCompiler({
  rootDir: './src',
  appFile: './src/app.ts',
  outDir: './.vertz',
});

const ir = await compiler.analyze();

const diagnostics = await compiler.validate(ir);
if (diagnostics.some((d) => d.severity === 'error')) {
  console.error('Validation errors:', diagnostics);
  process.exit(1);
}

await compiler.generate(ir);
```

## Intermediate Representation (IR)

```typescript
interface AppIR {
  app: AppDefinition;
  modules: ModuleIR[];
  middleware: MiddlewareIR[];
  schemas: SchemaIR[];
  env: EnvIR;
  dependencyGraph: DependencyGraphIR;
  diagnostics: Diagnostic[];
}
```

## Analyzers

Each analyzer extracts specific aspects of the application:

- **AppAnalyzer** — Extracts `createApp()` configuration
- **ModuleAnalyzer** — Extracts modules, services, and routers
- **SchemaAnalyzer** — Extracts schema definitions
- **MiddlewareAnalyzer** — Extracts middleware definitions
- **EnvAnalyzer** — Extracts environment variable declarations
- **DependencyGraphAnalyzer** — Builds service dependency graph

All analyzers extend `BaseAnalyzer` and implement:

```typescript
interface Analyzer<T> {
  analyze(): Promise<T>;
}
```

## Validators

- **NamingValidator** — Checks naming conventions (PascalCase modules, camelCase services)
- **PlacementValidator** — Ensures code is in the correct directories
- **CompletenessValidator** — Checks for missing exports, dangling references
- **ModuleValidator** — Validates module structure

Custom validators implement:

```typescript
interface Validator {
  validate(ir: AppIR): Promise<Diagnostic[]>;
}
```

## Generators

- **BootGenerator** — Generates `boot.ts` with module registration code
- **RouteTableGenerator** — Generates runtime route table with validation schemas
- **SchemaRegistryGenerator** — Generates schema registry for runtime validation
- **ManifestGenerator** — Generates JSON manifest for introspection
- **OpenAPIGenerator** — Generates OpenAPI 3.0 specification

Custom generators extend `BaseGenerator`:

```typescript
interface Generator {
  generate(ir: AppIR, outputDir: string): Promise<void>;
}
```

## Configuration

```typescript
import { defineConfig } from '@vertz/compiler';

export default defineConfig({
  rootDir: './src',
  appFile: './src/app.ts',
  outDir: './.vertz',
});
```

### Full Config Options

```typescript
interface VertzConfig {
  rootDir: string;
  appFile: string;
  outDir: string;

  compiler?: {
    outputDir?: string;
    incremental?: boolean;
    watch?: boolean;
  };

  validation?: {
    strict?: boolean;
    rules?: {
      naming?: boolean;
      placement?: boolean;
      completeness?: boolean;
    };
  };

  schema?: {
    generateJSONSchema?: boolean;
    includeExamples?: boolean;
  };

  openapi?: {
    enabled?: boolean;
    info?: { title?: string; version?: string; description?: string };
    servers?: Array<{ url: string; description?: string }>;
  };
}
```

## Incremental Compilation

```typescript
import { IncrementalCompiler } from '@vertz/compiler';

const compiler = new IncrementalCompiler(config);
await compiler.compile();

// On file change — reanalyze only affected modules
await compiler.recompile(['./src/users/users.service.ts']);
```

## Diagnostics

```typescript
interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  context?: SourceContext;
}
```

## Extensibility

All extension points use dependency injection — pass custom analyzers, validators, or generators to `createCompiler()`:

```typescript
const compiler = createCompiler(config, {
  validators: [new NamingValidator(), new CustomValidator()],
  generators: [new BootGenerator(config), new CustomGenerator()],
});
```

## API Reference

### Core Functions

- `createCompiler(config, deps?)` — Create compiler instance
- `defineConfig(config)` — Define configuration
- `resolveConfig(config)` — Resolve configuration with defaults

### Utilities

- `typecheck(options)` — Run TypeScript type checking
- `typecheckWatch(options)` — Run type checking in watch mode
- `createDiagnostic(options)` — Create diagnostic
- `hasErrors(diagnostics)` — Check if diagnostics contain errors
- `filterBySeverity(diagnostics, severity)` — Filter diagnostics
- `findCallExpressions(sourceFile, name)` — Find call expressions in AST
- `getStringValue(node, key)` — Extract string literal value
- `extractObjectLiteral(node, key)` — Extract object literal
- `resolveIdentifier(sourceFile, name)` — Resolve imports across files
