# @vertz/codegen

Code generation for Vertz applications. Generates TypeScript SDKs, CLIs, and type definitions from your Vertz app's intermediate representation (IR).

## What it does

`@vertz/codegen` transforms your Vertz app's compiled IR into:

- **TypeScript SDK** — Type-safe client with generated methods for every route
- **CLI** — Command-line interface with auto-generated commands
- **Type definitions** — Input/output types for operations, schemas, and streaming events

The codegen runs automatically during compilation (via `@vertz/compiler`) but can also be used standalone for custom generation workflows.

## When it's used

**Typical workflow:**

1. You define routes, schemas, and modules in your Vertz app
2. The Vertz compiler analyzes your code and produces an AppIR
3. `@vertz/codegen` transforms the AppIR into SDK/CLI code
4. Generated code is written to `.vertz/generated/` (or your custom output dir)

**Manual usage:**

If you need custom generation (e.g., generating code from an external API schema), you can use the codegen API directly:

```typescript
import { generate } from '@vertz/codegen';
import type { AppIR } from '@vertz/compiler';

const result = await generate(appIR, {
  generators: ['typescript', 'cli'],
  outputDir: './generated',
  typescript: {
    clientName: 'createMyClient',
    schemas: true,
  },
  cli: {
    enabled: true,
  },
});

console.log(`Generated ${result.fileCount} files`);
```

## Configuration

Use `defineCodegenConfig()` to configure code generation in your Vertz app:

```typescript
import { defineCodegenConfig } from '@vertz/codegen';

export default defineCodegenConfig({
  generators: ['typescript', 'cli'],
  outputDir: '.vertz/generated',
  format: true, // Format with Biome (default: true)
  incremental: true, // Only write changed files (default: true)
  
  typescript: {
    clientName: 'createClient', // SDK function name
    schemas: true, // Re-export schemas (default: true)
    publishable: {
      name: '@myapp/sdk',
      outputDir: './packages/sdk',
      version: '1.0.0',
    },
  },
  
  cli: {
    enabled: true,
    publishable: {
      name: '@myapp/cli',
      binName: 'myapp',
      outputDir: './packages/cli',
      version: '1.0.0',
    },
  },
});
```

## Public API

### Configuration

- **`defineCodegenConfig(config)`** — Define code generation config with type safety
- **`resolveCodegenConfig(config?)`** — Resolve config with defaults
- **`validateCodegenConfig(config)`** — Validate config and return errors

### Generation

- **`generate(appIR, config)`** — Generate code from AppIR
  - Returns `GenerateResult` with file list, IR, and stats
- **`createCodegenPipeline()`** — Create reusable generation pipeline
  - Supports custom generators and incremental regeneration

### TypeScript Generator

Emit SDK components:

- **`emitClientFile(ir)`** — Main SDK client file
- **`emitModuleFile(module)`** — Module-specific client code
- **`emitOperationMethod(op)`** — Individual operation methods
- **`emitStreamingMethod(op)`** — Streaming operation methods
- **`emitAuthStrategyBuilder(auth)`** — Auth strategy builders
- **`emitSDKConfig(ir)`** — SDK configuration types

Emit type definitions:

- **`emitModuleTypesFile(module, schemas)`** — Module types
- **`emitSharedTypesFile(schemas)`** — Shared types
- **`emitOperationInputType(op)`** — Input types
- **`emitOperationResponseType(op)`** — Response types
- **`emitStreamingEventType(op)`** — Streaming event types
- **`emitInterfaceFromSchema(schema)`** — Schema → TypeScript interface

Emit package structure:

- **`emitBarrelIndex(modules)`** — Barrel index file
- **`emitSchemaReExports(schemas)`** — Schema re-exports
- **`emitPackageJson(options)`** — package.json for publishable SDK

### CLI Generator

- **`emitManifestFile(ir)`** — CLI manifest (command definitions)
- **`emitCommandDefinition(op)`** — Command definition from operation
- **`emitModuleCommands(module)`** — Module commands
- **`emitBinEntryPoint(options)`** — Executable entry point
- **`scaffoldCLIPackageJson(options)`** — package.json for publishable CLI
- **`scaffoldCLIRootIndex()`** — CLI root index file

### Utilities

- **`adaptIR(appIR)`** — Transform AppIR → CodegenIR
- **`jsonSchemaToTS(schema)`** — Convert JSON Schema → TypeScript
- **`hashContent(content)`** — Content-based hashing for incremental generation
- **`writeIncremental(files, outputDir, options)`** — Write only changed files
- **`formatWithBiome(code)`** — Format generated code

Naming utilities:

- **`toPascalCase(str)`** — `hello_world` → `HelloWorld`
- **`toCamelCase(str)`** — `hello_world` → `helloWorld`
- **`toKebabCase(str)`** — `HelloWorld` → `hello-world`
- **`toSnakeCase(str)`** — `HelloWorld` → `hello_world`

Import management:

- **`mergeImports(imports)`** — Merge import statements
- **`renderImports(imports)`** — Render imports as code

## Custom Generators

To create a custom generator, implement the `Generator` interface:

```typescript
import type { Generator, CodegenIR, GeneratedFile } from '@vertz/codegen';

const myGenerator: Generator = {
  name: 'my-generator',
  run(ir: CodegenIR): GeneratedFile[] {
    return [
      {
        path: 'output.txt',
        content: `Generated from ${ir.modules.length} modules`,
      },
    ];
  },
};

// Use in pipeline
import { createCodegenPipeline } from '@vertz/codegen';

const pipeline = createCodegenPipeline();
pipeline.addGenerator(myGenerator);
const result = await pipeline.run(appIR, config);
```

## Incremental Regeneration

By default, codegen uses incremental mode to avoid rewriting unchanged files:

```typescript
const result = await generate(appIR, {
  incremental: true, // default
  outputDir: './generated',
});

console.log(result.incremental?.stats);
// {
//   written: 3,    // Files written (changed)
//   skipped: 12,   // Files skipped (unchanged)
//   deleted: 1,    // Stale files removed
// }
```

This improves performance by:

- Skipping file writes when content is identical (preserves timestamps)
- Avoiding unnecessary TypeScript recompilation
- Detecting and removing stale generated files

## Type Safety

All generated code is fully type-safe. The codegen preserves:

- Input/output types from your routes
- Schema types from `@vertz/schema`
- Generic type parameters (e.g., auth context, streaming events)
- Discriminated unions for operation responses

Example generated SDK usage:

```typescript
import { createClient } from './.vertz/generated';

const client = createClient({ baseURL: 'https://api.example.com' });

// Fully typed
const user = await client.users.getUser({ id: '123' });
//    ^? { id: string; name: string; email: string }

// Streaming with typed events
const stream = client.events.subscribe();
for await (const event of stream) {
  if (event.type === 'user.created') {
    console.log(event.data.user.name);
    //          ^? string
  }
}
```

## Related Packages

- **[@vertz/compiler](../compiler)** — Analyzes Vertz apps and produces AppIR
- **[@vertz/cli](../cli)** — Provides `vertz codegen` command
- **[@vertz/cli-runtime](../cli-runtime)** — Runtime for generated CLIs

## License

MIT
