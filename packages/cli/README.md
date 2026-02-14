# @vertz/cli

The official command-line interface for building, developing, and managing Vertz applications.

## Installation

```bash
npm install @vertz/cli
```

The CLI is also included when you create a new Vertz app:

```bash
npm create vertz-app my-app
cd my-app
npm install
```

## Usage

### As a Binary

When installed, the CLI provides the `vertz` command:

```bash
vertz --help
vertz dev
vertz build
vertz check
```

### Programmatic API

You can also use the CLI programmatically to build custom tooling:

```ts
import { createCLI } from '@vertz/cli';

const program = createCLI();
program.parse();
```

## Commands

### `vertz dev`

Start the development server with hot reload.

```bash
vertz dev
vertz dev --port 4000
vertz dev --host 0.0.0.0
vertz dev --no-typecheck
```

**Options:**
- `-p, --port <port>` — Server port (default: `3000`)
- `--host <host>` — Server host (default: `localhost`)
- `--no-typecheck` — Disable background type checking

### `vertz build`

Compile the project for production.

```bash
vertz build
vertz build --strict
vertz build --output dist
```

**Options:**
- `--strict` — Enable strict mode (fails on warnings)
- `--output <dir>` — Output directory

### `vertz check`

Type-check and validate the project without building.

```bash
vertz check
vertz check --strict
vertz check --format json
```

**Options:**
- `--strict` — Enable strict mode
- `--format <format>` — Output format: `text`, `json`, or `github` (default: `text`)

### `vertz generate <type> [name]`

Generate modules, services, routers, or schemas.

```bash
vertz generate module users
vertz generate service user --module users
vertz generate router api --module users
vertz generate schema user --module users
```

**Types:**
- `module` — Generate a new module
- `service` — Generate a service (requires `--module`)
- `router` — Generate a router (requires `--module`)
- `schema` — Generate a schema (requires `--module`)

**Options:**
- `--module <name>` — Target module (required for service, router, schema)
- `--dry-run` — Preview generated files without writing

### `vertz codegen`

Generate SDK and CLI clients from the compiled API.

```bash
vertz codegen
vertz codegen --dry-run
vertz codegen --output clients
```

**Options:**
- `--dry-run` — Preview generated files without writing
- `--output <dir>` — Output directory

### `vertz routes`

Display the application's route table.

```bash
vertz routes
vertz routes --format json
```

**Options:**
- `--format <format>` — Output format: `table` or `json` (default: `table`)

## Configuration

Create a `vertz.config.ts` (or `.js`, `.mjs`) file in your project root:

```ts
import type { CLIConfig } from '@vertz/cli';

const config: CLIConfig = {
  strict: false,
  forceGenerate: false,
  compiler: {
    sourceDir: 'src',
    entryFile: 'src/app.ts',
    outputDir: '.vertz/generated',
  },
  dev: {
    port: 3000,
    host: 'localhost',
    open: false,
    typecheck: true,
  },
};

export default config;
```

### Configuration Options

#### `strict` (boolean)

Enable strict mode for compilation (treat warnings as errors).

**Default:** `false`

#### `forceGenerate` (boolean)

Force code generation even if files are up-to-date.

**Default:** `false`

#### `compiler` (object)

Compiler configuration:

- `sourceDir` — Source directory (default: `'src'`)
- `entryFile` — Entry file path (default: `'src/app.ts'`)
- `outputDir` — Generated code output directory (default: `'.vertz/generated'`)

#### `dev` (object)

Development server configuration:

- `port` — Server port (default: `3000`)
- `host` — Server host (default: `'localhost'`)
- `open` — Open browser on start (default: `false`)
- `typecheck` — Enable background type checking (default: `true`)

#### `generators` (object)

Custom generator definitions (see "Custom Generators" below).

## Programmatic API

The CLI exports utilities for building custom tooling and extensions.

### Build Action

```ts
import { buildAction } from '@vertz/cli';
import { createCompiler } from '@vertz/compiler';

const compiler = await createCompiler({ sourceDir: 'src' });
const result = await buildAction({ compiler });

if (result.success) {
  console.log(result.output);
} else {
  console.error(result.output);
  process.exit(1);
}
```

### Generate Action

```ts
import { generateAction } from '@vertz/cli';

const result = generateAction({
  type: 'module',
  name: 'users',
  sourceDir: 'src',
});

if (result.success) {
  for (const file of result.files) {
    console.log(`Generated: ${file.path}`);
  }
} else {
  console.error(result.error);
}
```

### Development Loop

Create a custom development server with hot reload:

```ts
import { createDevLoop, createProcessManager, createWatcher } from '@vertz/cli';
import { createCompiler } from '@vertz/compiler';

const compiler = await createCompiler({ sourceDir: 'src' });
const processManager = createProcessManager({
  command: 'node',
  args: ['dist/index.js'],
  cwd: process.cwd(),
});
const watcher = createWatcher({ paths: ['src/**/*.ts'] });

const devLoop = createDevLoop({
  compile: () => compiler.compile(),
  startProcess: () => processManager.start(),
  stopProcess: () => processManager.stop(),
  onFileChange: (handler) => watcher.on('change', handler),
  onCompileSuccess: (result) => {
    console.log('✓ Compiled successfully');
  },
  onCompileError: (result) => {
    console.error('✗ Compilation failed');
  },
});

await devLoop.start();
```

### Task Runner

Build rich CLI UIs with the task runner:

```ts
import { createTaskRunner } from '@vertz/cli';

const runner = createTaskRunner();

const buildTask = runner.add('build', async (task) => {
  task.start('Building...');
  // do work
  task.succeed('Built successfully');
});

const deployTask = runner.add('deploy', async (task) => {
  task.start('Deploying...');
  // do work
  task.succeed('Deployed');
});

await runner.run();
```

### Diagnostic Formatting

Format compiler diagnostics for terminal output:

```ts
import { formatDiagnostic, formatDiagnosticSummary } from '@vertz/cli';

const diagnostics = await compiler.validate(ir);

for (const diagnostic of diagnostics) {
  console.log(formatDiagnostic(diagnostic));
}

console.log(formatDiagnosticSummary(diagnostics));
```

### Utilities

```ts
import {
  colors,
  symbols,
  formatDuration,
  formatFileSize,
  formatPath,
  findProjectRoot,
  detectRuntime,
  isCI,
} from '@vertz/cli';

// Colored output
console.log(colors.green('Success!'));
console.log(colors.red('Error!'));
console.log(`${symbols.success} Done`);

// Formatting
console.log(formatDuration(1234)); // "1.23s"
console.log(formatFileSize(1024)); // "1.0 KB"
console.log(formatPath('/long/path/to/file.ts')); // "~/file.ts"

// Project detection
const root = findProjectRoot(); // finds nearest package.json
const runtime = detectRuntime(); // 'node' | 'bun' | 'deno'
const ci = isCI(); // true if running in CI environment
```

## Custom Generators

Extend the `generate` command with your own generators by adding them to your config:

```ts
import type { CLIConfig, GeneratorDefinition } from '@vertz/cli';

const customGenerator: GeneratorDefinition = {
  name: 'entity',
  description: 'Generate a domain entity with schema and service',
  arguments: [
    {
      name: 'name',
      description: 'Entity name',
      required: true,
    },
  ],
  options: [
    {
      name: 'timestamps',
      flag: '--timestamps',
      description: 'Include createdAt and updatedAt fields',
      default: 'true',
    },
  ],
  async run(context) {
    const { name, options, sourceDir } = context;
    
    // Generate files
    const schemaFile = {
      path: `${sourceDir}/entities/${name}.schema.ts`,
      content: `export const ${name}Schema = s.object({ /* ... */ });`,
    };
    
    const serviceFile = {
      path: `${sourceDir}/entities/${name}.service.ts`,
      content: `export class ${name}Service { /* ... */ }`,
    };
    
    return [schemaFile, serviceFile];
  },
};

const config: CLIConfig = {
  generators: {
    entity: customGenerator,
  },
};

export default config;
```

Now you can use your custom generator:

```bash
vertz generate entity product
vertz generate entity product --timestamps false
```

### Generator Context

The generator `run` function receives a context object:

```ts
interface GeneratorContext {
  name: string;                    // Argument value
  options: Record<string, string>; // Parsed options
  projectRoot: string;             // Project root directory
  sourceDir: string;               // Source directory (from config)
  config: VertzConfig;             // Full Vertz config
}
```

Return an array of files to generate:

```ts
interface GeneratedFile {
  path: string;   // Absolute or relative to project root
  content: string; // File content
}
```

## UI Components

The CLI exports Ink-based React components for building rich terminal UIs:

```tsx
import { render } from 'ink';
import {
  Banner,
  Message,
  Task,
  TaskList,
  SelectList,
  DiagnosticDisplay,
  DiagnosticSummary,
} from '@vertz/cli';

// Banner
<Banner title="My CLI Tool" version="1.0.0" />

// Message
<Message type="success">Operation completed!</Message>
<Message type="error">Something went wrong</Message>
<Message type="info">FYI: This is informational</Message>

// Tasks
<TaskList>
  <Task label="Building..." status="pending" />
  <Task label="Testing..." status="success" />
  <Task label="Deploying..." status="error" message="Deploy failed" />
</TaskList>

// Select list
<SelectList
  items={['Option 1', 'Option 2', 'Option 3']}
  onSelect={(item) => console.log(item)}
/>

// Diagnostics
<DiagnosticDisplay diagnostics={diagnostics} />
<DiagnosticSummary diagnostics={diagnostics} />
```

## Configuration Loading

Load and merge configuration files:

```ts
import { findConfigFile, loadConfig, defaultCLIConfig } from '@vertz/cli';

const configPath = findConfigFile(); // searches for vertz.config.{ts,js,mjs}
const config = configPath 
  ? await loadConfig(configPath)
  : defaultCLIConfig;
```

## TypeScript Support

All exports are fully typed. Import types for configuration and extension:

```ts
import type {
  CLIConfig,
  DevConfig,
  GeneratorDefinition,
  GeneratorContext,
  GeneratedFile,
  TaskRunner,
  TaskHandle,
  TaskGroup,
} from '@vertz/cli';
```

## Examples

### Custom Build Script

```ts
import { buildAction, formatDiagnosticSummary } from '@vertz/cli';
import { createCompiler } from '@vertz/compiler';

const compiler = await createCompiler({
  sourceDir: 'src',
  entryFile: 'src/app.ts',
  outputDir: '.vertz/generated',
});

const result = await buildAction({ compiler });

if (!result.success) {
  console.error(formatDiagnosticSummary(result.diagnostics));
  process.exit(1);
}

console.log(`✓ Built in ${result.durationMs}ms`);
```

### Interactive Generator

```ts
import { generateAction, isCI, requireParam } from '@vertz/cli';

const name = isCI() 
  ? process.argv[2] 
  : await requireParam('Module name:');

const result = generateAction({
  type: 'module',
  name,
  sourceDir: 'src',
});

if (result.success) {
  console.log(`Generated ${result.files.length} files`);
} else {
  console.error(result.error);
}
```

### Watch and Compile

```ts
import { createWatcher } from '@vertz/cli';
import { createCompiler } from '@vertz/compiler';

const compiler = await createCompiler({ sourceDir: 'src' });
const watcher = createWatcher({ paths: ['src/**/*.ts'] });

watcher.on('change', async (changes) => {
  console.log(`Changed: ${changes.map(c => c.path).join(', ')}`);
  
  const result = await compiler.compile();
  
  if (result.success) {
    console.log('✓ Recompiled successfully');
  } else {
    console.error('✗ Compilation failed');
  }
});

console.log('Watching for changes...');
```

## Related Packages

- [@vertz/core](../core) — Core framework
- [@vertz/compiler](../compiler) — Vertz compiler
- [@vertz/codegen](../codegen) — Code generation utilities

## License

MIT
