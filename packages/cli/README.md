# @vertz/cli

The `vertz` command. Create, develop, build, and publish Vertz applications.

> **5-minute rule:** You should understand what this CLI does and how to use it in 5 minutes or less. If not, [open an issue](https://github.com/nicholasgriffintn/vertz/issues) — that's a bug in our docs.

## What is this?

`@vertz/cli` is the developer tool for Vertz projects. It's the `vertz` binary you run in your terminal. If you're looking for terminal UI building blocks (spinners, task lists, select menus), that's `@vertz/tui`.

---

## You want to start a new project

```bash
npx @vertz/cli create my-app
cd my-app
```

This scaffolds a new Vertz app with a working `src/app.ts`, config file, and dev scripts. You'll have a running server in under a minute.

Your entry point will look something like this:

```ts
import { createServer } from '@vertz/server';

const app = createServer();
// ... define your routes, modules, services
```

---

## You want to develop locally

```bash
vertz dev
```

That's it. This starts your dev server with hot reload, background type-checking, and compiler diagnostics right in your terminal.

**Common options:**

```bash
vertz dev --port 4000          # custom port
vertz dev --host 0.0.0.0      # expose to network
vertz dev --no-typecheck       # skip background type-checking
```

**What happens under the hood:**
1. Compiles your `src/` directory
2. Starts your server (default: `localhost:3000`)
3. Watches for file changes and recompiles automatically
4. Runs type-checking in the background so errors show inline

---

## You want to build for production

```bash
vertz build
```

Compiles your project, runs validation, and outputs production-ready code.

```bash
vertz build --strict           # treat warnings as errors
vertz build --output dist      # custom output directory
```

---

## You want to check your code without building

```bash
vertz check
```

Type-checks and validates your project without producing output. Useful in CI or as a pre-commit hook.

```bash
vertz check --strict           # fail on warnings
vertz check --format json      # machine-readable output (text | json | github)
```

---

## You want to generate code

```bash
vertz generate module users
vertz generate service user --module users
vertz generate router api --module users
vertz generate schema user --module users
```

Scaffolds modules, services, routers, and schemas. Use `--dry-run` to preview what will be generated.

You can also define [custom generators](#custom-generators) in your config.

---

## You want to deploy *(coming soon)*

```bash
vertz publish
```

One-command deployment to your configured target. **This command is not yet available** — it's on the roadmap.

---

## You want to see your routes

```bash
vertz routes                   # table format
vertz routes --format json     # JSON output
```

Displays every route your application exposes.

---

## Installation

```bash
npm install @vertz/cli         # or bun add @vertz/cli
```

**Requirements:** Node.js 18+ or Bun 1.0+, TypeScript 5.0+

---

## Configuration

Create `vertz.config.ts` in your project root:

```ts
import type { CLIConfig } from '@vertz/cli';

const config: CLIConfig = {
  compiler: {
    sourceDir: 'src',
    entryFile: 'src/app.ts',
    outputDir: '.vertz/generated',
  },
  dev: {
    port: 3000,
    host: 'localhost',
    typecheck: true,
  },
};

export default config;
```

Also supports `.js` and `.mjs`. See [Configuration Reference](#configuration-reference) for all options.

---

## Custom Generators

Extend `vertz generate` with your own templates:

```ts
import type { CLIConfig, GeneratorDefinition } from '@vertz/cli';

const entity: GeneratorDefinition = {
  name: 'entity',
  description: 'Generate a domain entity with schema and service',
  arguments: [{ name: 'name', description: 'Entity name', required: true }],
  options: [
    { name: 'timestamps', flag: '--timestamps', description: 'Include timestamp fields', default: 'true' },
  ],
  async run({ name, sourceDir }) {
    return [
      { path: `${sourceDir}/entities/${name}.schema.ts`, content: `export const ${name}Schema = s.object({});` },
      { path: `${sourceDir}/entities/${name}.service.ts`, content: `export class ${name}Service {}` },
    ];
  },
};

const config: CLIConfig = {
  generators: { entity },
};

export default config;
```

```bash
vertz generate entity product
vertz generate entity product --timestamps false
```

---

## Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strict` | `boolean` | `false` | Treat warnings as errors |
| `forceGenerate` | `boolean` | `false` | Force code generation even if up-to-date |
| `compiler.sourceDir` | `string` | `'src'` | Source directory |
| `compiler.entryFile` | `string` | `'src/app.ts'` | Entry file path |
| `compiler.outputDir` | `string` | `'.vertz/generated'` | Generated code output |
| `dev.port` | `number` | `3000` | Dev server port |
| `dev.host` | `string` | `'localhost'` | Dev server host |
| `dev.open` | `boolean` | `false` | Open browser on start |
| `dev.typecheck` | `boolean` | `true` | Background type-checking |

---

## Programmatic API

The CLI exports its internals for custom tooling. See the [Programmatic API docs](./docs/programmatic-api.md) for details on `buildAction`, `generateAction`, `createDevLoop`, `createTaskRunner`, and more.

---

## Related Packages

- [`@vertz/server`](../server) — Server framework (`createServer`)
- [`@vertz/compiler`](../compiler) — Vertz compiler
- [`@vertz/codegen`](../codegen) — Code generation utilities

## License

MIT
