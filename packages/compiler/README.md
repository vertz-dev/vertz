# @vertz/compiler

> Static analysis and code generation for vertz applications

The vertz compiler analyzes TypeScript source code to extract application structure, validate conventions, and generate runtime artifacts like route tables, dependency graphs, and OpenAPI specs.

## Prerequisites

- **Node.js** 18+ or **Bun** 1.0+
- **TypeScript** 5.0+

## Installation

```bash
# npm
npm install @vertz/compiler

# bun
bun add @vertz/compiler
```

## Overview

The compiler consists of three main stages:

1. **Analysis** — Parse TypeScript AST and extract IR (Intermediate Representation)
2. **Validation** — Check conventions, completeness, and correctness
3. **Generation** — Emit runtime artifacts and documentation

```
  Source Code (*.ts)
       ↓
  [Analyzers] → AppIR (Intermediate Representation)
       ↓
  [Validators] → Diagnostics (errors/warnings)
       ↓
  [Generators] → Artifacts (boot.ts, manifest.json, openapi.json)
```

## Quick Start

```typescript
import { createCompiler } from '@vertz/compiler';

// Create compiler with default config
const compiler = createCompiler({
  rootDir: './src',
  appFile: './src/app.ts',
  outDir: './.vertz',
});

// Analyze the application
const ir = await compiler.analyze();

// Validate the IR
const diagnostics = await compiler.validate(ir);

if (diagnostics.some((d) => d.severity === 'error')) {
  console.error('Validation errors:', diagnostics);
  process.exit(1);
}

// Generate artifacts
await compiler.generate(ir);

console.log('✅ Compilation successful');
```

## Core Concepts

### Intermediate Representation (IR)

The IR is a structured representation of your vertz application extracted from source code:

```typescript
interface AppIR {
  app: AppDefinition;              // App configuration (basePath, CORS, etc.)
  modules: ModuleIR[];             // All modules
  middleware: MiddlewareIR[];      // Global middleware
  schemas: SchemaIR[];             // Schema definitions
  env: EnvIR;                      // Environment variables
  dependencyGraph: DependencyGraphIR; // Service dependency graph
  diagnostics: Diagnostic[];       // Analysis issues
}
```

### Analyzers

Analyzers extract specific aspects of your application:

- **AppAnalyzer** — Extracts `createApp()` configuration
- **ModuleAnalyzer** — Extracts modules, services, and routers
- **SchemaAnalyzer** — Extracts schema definitions
- **MiddlewareAnalyzer** — Extracts middleware definitions
- **EnvAnalyzer** — Extracts environment variable declarations
- **DependencyGraphAnalyzer** — Builds service dependency graph

Each analyzer extends `BaseAnalyzer` and implements:

```typescript
interface Analyzer<T> {
  analyze(): Promise<T>;
}
```

### Validators

Validators check the IR for correctness:

- **NamingValidator** — Checks naming conventions (PascalCase modules, camelCase services)
- **PlacementValidator** — Ensures code is in the correct directories
- **CompletenessValidator** — Checks for missing exports, dangling references
- **ModuleValidator** — Validates module structure (services, routers, exports)

Each validator implements:

```typescript
interface Validator {
  validate(ir: AppIR): Promise<Diagnostic[]>;
}
```

### Generators

Generators emit artifacts from the IR:

- **BootGenerator** — Generates `boot.ts` with module registration code
- **RouteTableGenerator** — Generates runtime route table with validation schemas
- **SchemaRegistryGenerator** — Generates schema registry for runtime validation
- **ManifestGenerator** — Generates JSON manifest for introspection
- **OpenAPIGenerator** — Generates OpenAPI 3.0 specification

Each generator implements:

```typescript
interface Generator {
  generate(ir: AppIR, outputDir: string): Promise<void>;
}
```

## Configuration

### Basic Config

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
  rootDir: string;              // Project root directory
  appFile: string;              // Path to app entry file
  outDir: string;               // Output directory for artifacts

  compiler?: {
    outputDir?: string;         // Override output directory
    incremental?: boolean;      // Enable incremental compilation
    watch?: boolean;            // Enable watch mode
  };

  validation?: {
    strict?: boolean;           // Fail on warnings
    rules?: {
      naming?: boolean;         // Check naming conventions
      placement?: boolean;      // Check file placement
      completeness?: boolean;   // Check for missing references
    };
  };

  schema?: {
    generateJSONSchema?: boolean; // Generate JSON Schema for validation
    includeExamples?: boolean;    // Include examples in schemas
  };

  openapi?: {
    enabled?: boolean;          // Generate OpenAPI spec
    info?: {
      title?: string;
      version?: string;
      description?: string;
    };
    servers?: Array<{
      url: string;
      description?: string;
    }>;
  };
}
```

## Analyzers

### AppAnalyzer

Extracts `createApp()` configuration:

```typescript
import { AppAnalyzer } from '@vertz/compiler';
import { Project } from 'ts-morph';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const analyzer = new AppAnalyzer(project, './src/app.ts');
const result = await analyzer.analyze();

console.log(result.app);
/*
{
  basePath: '/api',
  globalMiddleware: ['auth', 'logging'],
  sourceFile: './src/app.ts',
  sourceLine: 10,
  sourceColumn: 15
}
*/
```

### ModuleAnalyzer

Extracts modules, services, and routers:

```typescript
import { ModuleAnalyzer } from '@vertz/compiler';

const analyzer = new ModuleAnalyzer(project, { rootDir: './src' });
const result = await analyzer.analyze();

console.log(result.modules);
/*
[
  {
    name: 'users',
    sourceFile: './src/users/users.module.ts',
    services: [...],
    routers: [...],
    exports: [...]
  }
]
*/
```

### SchemaAnalyzer

Extracts schema definitions:

```typescript
import { SchemaAnalyzer } from '@vertz/compiler';

const analyzer = new SchemaAnalyzer(project, { rootDir: './src' });
const result = await analyzer.analyze();

console.log(result.schemas);
/*
[
  {
    id: 'users:CreateUserDto',
    moduleName: 'users',
    name: 'CreateUserDto',
    sourceFile: './src/users/schemas.ts',
    definition: { ... }
  }
]
*/
```

## Validators

### Custom Validator

Create custom validators by implementing the `Validator` interface:

```typescript
import type { Validator, AppIR, Diagnostic } from '@vertz/compiler';
import { createDiagnostic } from '@vertz/compiler';

class CustomValidator implements Validator {
  async validate(ir: AppIR): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const module of ir.modules) {
      if (module.services.length === 0) {
        diagnostics.push(
          createDiagnostic({
            code: 'CUSTOM_001',
            severity: 'warning',
            message: `Module "${module.name}" has no services`,
            file: module.sourceFile,
            line: module.sourceLine,
          }),
        );
      }
    }

    return diagnostics;
  }
}
```

Use custom validators:

```typescript
const compiler = createCompiler(config, {
  validators: [
    new NamingValidator(),
    new PlacementValidator(config),
    new CustomValidator(), // ← Your validator
  ],
});
```

## Generators

### Custom Generator

Create custom generators by extending `BaseGenerator`:

```typescript
import { BaseGenerator, type AppIR } from '@vertz/compiler';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

class CustomGenerator extends BaseGenerator {
  async generate(ir: AppIR, outputDir: string): Promise<void> {
    const output = this.generateOutput(ir);
    const outputPath = join(outputDir, 'custom-output.json');
    await writeFile(outputPath, JSON.stringify(output, null, 2));
  }

  private generateOutput(ir: AppIR): object {
    return {
      moduleCount: ir.modules.length,
      routeCount: ir.modules.flatMap((m) => m.routers.flatMap((r) => r.routes)).length,
      serviceCount: ir.modules.flatMap((m) => m.services).length,
    };
  }
}
```

Use custom generators:

```typescript
const compiler = createCompiler(config, {
  generators: [
    new BootGenerator(config),
    new ManifestGenerator(),
    new CustomGenerator(), // ← Your generator
  ],
});
```

## Incremental Compilation

For faster rebuilds, use incremental compilation:

```typescript
import { IncrementalCompiler } from '@vertz/compiler';

const compiler = new IncrementalCompiler(config);

// Initial compilation
await compiler.compile();

// On file change
const changedFiles = ['./src/users/users.service.ts'];
await compiler.recompile(changedFiles);
```

The incremental compiler:
- Caches previous IR
- Categorizes file changes (app, module, schema, etc.)
- Reanalyzes only affected modules
- Merges changes into existing IR

## Typecheck Integration

Run TypeScript type checking alongside compilation:

```typescript
import { typecheck } from '@vertz/compiler';

const result = await typecheck({
  project: './tsconfig.json',
  noEmit: true,
});

if (!result.success) {
  console.error('Type errors:', result.diagnostics);
}
```

Watch mode:

```typescript
import { typecheckWatch } from '@vertz/compiler';

for await (const result of typecheckWatch({ project: './tsconfig.json' })) {
  if (result.success) {
    console.log('✅ Types OK');
  } else {
    console.error('Type errors:', result.diagnostics);
  }
}
```

## Diagnostics

All errors and warnings are represented as `Diagnostic` objects:

```typescript
interface Diagnostic {
  code: string;             // Unique error code (e.g., 'MODULE_001')
  severity: 'error' | 'warning' | 'info';
  message: string;          // Human-readable message
  file?: string;            // Source file path
  line?: number;            // Line number
  column?: number;          // Column number
  context?: SourceContext;  // Additional context
}
```

Create diagnostics:

```typescript
import { createDiagnostic, createDiagnosticFromLocation } from '@vertz/compiler';

const diagnostic = createDiagnostic({
  code: 'CUSTOM_001',
  severity: 'error',
  message: 'Invalid configuration',
  file: './src/app.ts',
  line: 10,
  column: 5,
});

// Or from a ts-morph Node
const nodeWithError = sourceFile.getFunction('myFunction');
const diagnostic2 = createDiagnosticFromLocation(nodeWithError, {
  code: 'CUSTOM_002',
  message: 'Function is deprecated',
  severity: 'warning',
});
```

Filter diagnostics:

```typescript
import { filterBySeverity, hasErrors } from '@vertz/compiler';

const errors = filterBySeverity(diagnostics, 'error');
const warnings = filterBySeverity(diagnostics, 'warning');

if (hasErrors(diagnostics)) {
  console.error('Compilation failed');
  process.exit(1);
}
```

## Architecture

### Compiler Pipeline

```
┌─────────────────────────────────────────────────────────┐
│  1. Configuration                                       │
│     - Load vertz.config.ts                              │
│     - Resolve paths, options                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  2. Analysis (ts-morph AST traversal)                   │
│     - AppAnalyzer → app config                          │
│     - ModuleAnalyzer → modules, services, routers       │
│     - SchemaAnalyzer → schemas                          │
│     - MiddlewareAnalyzer → middleware                   │
│     - EnvAnalyzer → env vars                            │
│     - DependencyGraphAnalyzer → service graph           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  3. IR Construction                                     │
│     - Combine analyzer results                          │
│     - Build unified AppIR                               │
│     - Add cross-references                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  4. Validation                                          │
│     - NamingValidator                                   │
│     - PlacementValidator                                │
│     - CompletenessValidator                             │
│     - ModuleValidator                                   │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  5. Generation                                          │
│     - BootGenerator → boot.ts                           │
│     - RouteTableGenerator → routes.ts                   │
│     - SchemaRegistryGenerator → schemas.ts              │
│     - ManifestGenerator → manifest.json                 │
│     - OpenAPIGenerator → openapi.json                   │
└─────────────────────────────────────────────────────────┘
```

### Extensibility

The compiler is designed for extensibility:

- **Custom Analyzers** — Extract additional information from source code
- **Custom Validators** — Enforce custom rules and conventions
- **Custom Generators** — Emit custom artifacts (GraphQL schemas, docs, etc.)

All extension points use dependency injection — pass custom implementations to `createCompiler()`.

## CLI Integration

The compiler is typically used through `@vertz/cli`:

```bash
# Compile the app
vertz build

# Check for errors without building
vertz check

# Watch mode
vertz dev
```

See `@vertz/cli` for CLI documentation.

## Programmatic Usage

### Example: Extract Route Information

```typescript
import { createCompiler } from '@vertz/compiler';

const compiler = createCompiler({
  rootDir: './src',
  appFile: './src/app.ts',
  outDir: './.vertz',
});

const ir = await compiler.analyze();

// Extract all routes
const routes = ir.modules.flatMap((module) =>
  module.routers.flatMap((router) =>
    router.routes.map((route) => ({
      method: route.method,
      path: `${module.prefix ?? ''}${router.prefix}${route.path}`,
      module: module.name,
    })),
  ),
);

console.log('Routes:', routes);
```

### Example: Generate Custom Documentation

```typescript
import { createCompiler, type AppIR } from '@vertz/compiler';
import { writeFile } from 'node:fs/promises';

const compiler = createCompiler(config);
const ir = await compiler.analyze();

// Generate markdown docs
const markdown = generateDocs(ir);
await writeFile('./docs/api.md', markdown);

function generateDocs(ir: AppIR): string {
  let md = '# API Documentation\n\n';
  
  for (const module of ir.modules) {
    md += `## Module: ${module.name}\n\n`;
    
    for (const router of module.routers) {
      for (const route of router.routes) {
        md += `### ${route.method.toUpperCase()} ${router.prefix}${route.path}\n\n`;
        if (route.schema?.body) {
          md += `**Request Body:**\n\`\`\`json\n${JSON.stringify(route.schema.body, null, 2)}\n\`\`\`\n\n`;
        }
      }
    }
  }
  
  return md;
}
```

## API Reference

### Core Functions

- `createCompiler(config, deps?)` — Create compiler instance
- `defineConfig(config)` — Define configuration (for `vertz.config.ts`)
- `resolveConfig(config)` — Resolve configuration with defaults

### Analyzers

- `AppAnalyzer` — Extract app configuration
- `ModuleAnalyzer` — Extract modules
- `SchemaAnalyzer` — Extract schemas
- `MiddlewareAnalyzer` — Extract middleware
- `EnvAnalyzer` — Extract env variables
- `DependencyGraphAnalyzer` — Build dependency graph

### Validators

- `NamingValidator` — Check naming conventions
- `PlacementValidator` — Check file placement
- `CompletenessValidator` — Check completeness
- `ModuleValidator` — Validate module structure

### Generators

- `BootGenerator` — Generate boot file
- `RouteTableGenerator` — Generate route table
- `SchemaRegistryGenerator` — Generate schema registry
- `ManifestGenerator` — Generate JSON manifest
- `OpenAPIGenerator` — Generate OpenAPI spec

### Utilities

- `typecheck(options)` — Run TypeScript type checking
- `typecheckWatch(options)` — Run type checking in watch mode
- `createDiagnostic(options)` — Create diagnostic
- `hasErrors(diagnostics)` — Check if diagnostics contain errors
- `filterBySeverity(diagnostics, severity)` — Filter diagnostics

## Related Packages

- **[@vertz/cli](../cli)** — Command-line interface (uses the compiler)
- **[@vertz/codegen](../codegen)** — Code generation utilities
- **[@vertz/core](../core)** — Runtime framework (analyzed by compiler)

## Advanced Topics

### AST Traversal

The compiler uses `ts-morph` for AST traversal. Utilities are available:

```typescript
import { findCallExpressions, getStringValue, extractObjectLiteral } from '@vertz/compiler';
import { Project } from 'ts-morph';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const sourceFile = project.getSourceFile('app.ts');

// Find all createApp() calls
const appCalls = findCallExpressions(sourceFile, 'createApp');

// Extract string literal value
const basePath = getStringValue(configObject, 'basePath'); // '/api'

// Extract object literal
const corsConfig = extractObjectLiteral(configObject, 'cors');
```

### Schema Execution

Execute schemas at compile-time to extract metadata:

```typescript
import { createSchemaExecutor } from '@vertz/compiler';

const executor = createSchemaExecutor(project);
const result = await executor.execute('./src/schemas.ts', 'userSchema');

console.log(result.jsonSchema); // JSON Schema representation
```

### Import Resolution

Resolve imports and exports across files:

```typescript
import { resolveIdentifier, resolveExport } from '@vertz/compiler';

const resolved = resolveIdentifier(sourceFile, 'userService');
console.log(resolved.sourceFile, resolved.name);

const exported = resolveExport(sourceFile, 'userSchema');
console.log(exported);
```

## Performance

The compiler is optimized for large codebases:

- **Incremental compilation** — Only reanalyze changed modules
- **Parallel analysis** — Analyzers run concurrently
- **Caching** — IR is cached between runs
- **Lazy evaluation** — Generators only run when needed

Typical performance (1000 files, 50 modules):
- Initial compilation: ~2-5 seconds
- Incremental recompilation: ~100-500ms

## License

MIT
