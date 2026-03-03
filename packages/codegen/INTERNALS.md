# @vertz/codegen — Internals

Architecture and extension points for framework contributors.

## Pipeline

```
AppIR (from @vertz/compiler)
       ↓
  adaptIR() → CodegenIR
       ↓
  [Generators] → GeneratedFile[]
       ↓
  writeIncremental() → disk
```

## Programmatic Usage

```typescript
import { generate } from '@vertz/codegen';

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

```typescript
import { defineCodegenConfig } from '@vertz/codegen';

export default defineCodegenConfig({
  generators: ['typescript', 'cli'],
  outputDir: '.vertz/generated',
  format: true,
  incremental: true,

  typescript: {
    clientName: 'createClient',
    schemas: true,
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

## Custom Generators

Implement the `Generator` interface:

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

import { createCodegenPipeline } from '@vertz/codegen';

const pipeline = createCodegenPipeline();
pipeline.addGenerator(myGenerator);
const result = await pipeline.run(appIR, config);
```

## Incremental Regeneration

Skips file writes when content is unchanged (preserves timestamps, avoids unnecessary TS recompilation):

```typescript
const result = await generate(appIR, { incremental: true, outputDir: './generated' });

console.log(result.incremental?.stats);
// { written: 3, skipped: 12, deleted: 1 }
```

## API Reference

### Configuration

- `defineCodegenConfig(config)` — Define config with type safety
- `resolveCodegenConfig(config?)` — Resolve config with defaults
- `validateCodegenConfig(config)` — Validate config and return errors

### Generation

- `generate(appIR, config)` — Generate code from AppIR
- `createCodegenPipeline()` — Create reusable generation pipeline

### TypeScript Generator

- `emitClientFile(ir)` — Main SDK client file
- `emitModuleFile(module)` — Module-specific client code
- `emitModuleTypesFile(module, schemas)` — Module types
- `emitSharedTypesFile(schemas)` — Shared types
- `emitBarrelIndex(modules)` — Barrel index file
- `emitPackageJson(options)` — package.json for publishable SDK

### CLI Generator

- `emitManifestFile(ir)` — CLI manifest (command definitions)
- `emitBinEntryPoint(options)` — Executable entry point
- `scaffoldCLIPackageJson(options)` — package.json for publishable CLI

### Utilities

- `adaptIR(appIR)` — Transform AppIR to CodegenIR
- `jsonSchemaToTS(schema)` — Convert JSON Schema to TypeScript
- `hashContent(content)` — Content-based hashing for incremental generation
- `writeIncremental(files, outputDir, options)` — Write only changed files
- `formatWithBiome(code)` — Format generated code
- `toPascalCase(str)`, `toCamelCase(str)`, `toKebabCase(str)`, `toSnakeCase(str)` — Naming utilities
