# @vertz/cli

The `vertz` CLI — create, develop, build, and deploy Vertz applications.

> **5-minute rule:** You should understand what this CLI does and how to use it in 5 minutes or less. If not, [open an issue](https://github.com/vertz-dev/vertz/issues) — that's a bug in our docs.

## Quick Start

```bash
# Create a new project
npx @vertz/cli create my-app
cd my-app

# Start development
npx vertz dev

# Build for production
npx vertz build
```

---

## Installation

```bash
npm install @vertz/cli
# or
bun add @vertz/cli
```

**Requirements:** Node.js 22+ or Bun 1.0+

---

## Commands

### `vertz create <name>`

Scaffold a new Vertz project.

```bash
vertz create my-app                # Create with Bun (default)
vertz create my-app --runtime node # Create with Node.js
vertz create my-app --runtime deno # Create with Deno
vertz create my-app --example      # Include example health module
vertz create my-app --no-example   # Exclude example (default)
```

### `vertz dev`

Start the development server with hot reload. Runs the full pipeline (analyze → generate → build → serve) and watches for file changes.

```bash
vertz dev                          # Start on localhost:3000
vertz dev --port 4000              # Custom port
vertz dev --host 0.0.0.0           # Expose to network
vertz dev --open                   # Open browser on start
vertz dev --no-typecheck           # Disable background type-checking
vertz dev -v                       # Verbose output
```

### `vertz build`

Compile your project for production.

```bash
vertz build                        # Build for Node.js
vertz build --target edge          # Build for edge runtime
vertz build --target worker        # Build for worker runtime
vertz build --output dist          # Custom output directory
vertz build --no-typecheck         # Skip type checking
vertz build --no-minify            # Skip minification
vertz build --sourcemap            # Generate sourcemaps
vertz build -v                     # Verbose output
```

### `vertz check`

Type-check and validate your project without producing output. Useful in CI or as a pre-commit hook.

```bash
vertz check                        # Text output
vertz check --format json           # JSON output
vertz check --format github        # GitHub Actions format
```

### `vertz generate [type] [name]`

Generate code scaffolds. Supports multiple types:

```bash
# Generate a new module
vertz generate module users

# Generate service/router/schema within a module
vertz generate service user --module users
vertz generate router api --module users
vertz generate schema user --module users

# Auto-discover domains and generate all (experimental)
vertz generate

# Preview without writing files
vertz generate module users --dry-run
```

### `vertz codegen`

Generate SDK and CLI clients from your compiled API.

```bash
vertz codegen                      # Generate clients
vertz codegen --dry-run            # Preview without writing
vertz codegen --output ./sdk       # Custom output directory
```

Requires `codegen` configuration in `vertz.config.ts`:

```ts
const config = {
  codegen: {
    output: './src/clients',
    generators: ['typescript', 'swift', 'kotlin'],
  },
};
```

### `vertz routes`

Display all routes in your application.

```bash
vertz routes                       # Table format
vertz routes --format json         # JSON output
```

### `vertz db migrate`

Smart database migration. Automatically chooses the right Prisma command based on environment.

```bash
vertz db migrate                   # Auto-detect: dev=dev, prod=deploy
vertz db migrate --status         # Show migration status
vertz db migrate --create-only    # Create migration file without applying
vertz db migrate --name my-change # Specify migration name
vertz db migrate --reset          # Reset database (drop all tables)
vertz db migrate -v               # Verbose output
```

In development: runs `prisma migrate dev` (applies pending + creates new if schema changed).
In production: runs `prisma migrate deploy` (applies pending only).

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
    open: false,
  },
  codegen: {
    output: './src/clients',
    generators: ['typescript'],
  },
};

export default config;
```

### Configuration Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strict` | `boolean` | `false` | Treat warnings as errors |
| `compiler.sourceDir` | `string` | `'src'` | Source directory |
| `compiler.entryFile` | `string` | `'src/app.ts'` | Entry file |
| `compiler.outputDir` | `string` | `'.vertz/generated'` | Generated code output |
| `dev.port` | `number` | `3000` | Dev server port |
| `dev.host` | `string` | `'localhost'` | Dev server host |
| `dev.open` | `boolean` | `false` | Open browser on start |
| `dev.typecheck` | `boolean` | `true` | Background type-checking |

---

## Programmatic API

Import CLI functions for custom tooling:

```ts
import { buildAction, devAction, createDevLoop } from '@vertz/cli';

await buildAction({ output: './dist' });
await devAction({ port: 3000 });
```

---

## Related Packages

- [`@vertz/server`](../server) — Server framework (`createServer`)
- [`@vertz/compiler`](../compiler) — Vertz compiler
- [`@vertz/codegen`](../codegen) — Code generation utilities
- [`@vertz/tui`](../tui) — Terminal UI components

## License

MIT
