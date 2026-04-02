# @vertz/openapi

Generate typed TypeScript SDKs from OpenAPI 3.x specs. Produces a fully typed client with resource methods, TypeScript interfaces, and optional Zod schemas.

## Install

```bash
bun add @vertz/openapi
```

## Quick Start

```bash
npx @vertz/openapi generate --from ./openapi.json --output ./src/generated
```

This generates:

```
src/generated/
  client.ts          # createClient() factory + HttpClient interface
  types/             # TypeScript interfaces per resource
  resources/         # Typed resource methods per resource
  schemas/           # Zod schemas (opt-in with --schemas)
  README.md          # Usage documentation
```

## CLI

### `generate` — Generate SDK from a spec

```bash
npx @vertz/openapi generate [options]
```

| Flag                   | Description                              | Default                       |
| ---------------------- | ---------------------------------------- | ----------------------------- |
| `--from <path-or-url>` | Path to OpenAPI spec file or URL         | Required (or use config file) |
| `--output <dir>`       | Output directory                         | `./src/generated`             |
| `--base-url <url>`     | Default base URL for API calls           | `''`                          |
| `--group-by <mode>`    | Grouping strategy: `tag`, `path`, `none` | `tag`                         |
| `--schemas`            | Generate Zod validation schemas          | `false`                       |
| `--dry-run`            | Preview without writing files            | `false`                       |

### `validate` — Validate a spec without generating

```bash
npx @vertz/openapi validate --from ./openapi.json
```

## Config File

Create an `openapi.config.ts` in your project root:

```ts
import { defineConfig } from '@vertz/openapi';

export default defineConfig({
  source: './openapi.json',
  output: './src/generated',
  baseURL: 'https://api.example.com',
  groupBy: 'tag',
  schemas: true,
});
```

CLI flags override config file values.

## Programmatic API

```ts
import { generateFromOpenAPI } from '@vertz/openapi';

const result = await generateFromOpenAPI({
  source: './openapi.json',
  output: './src/generated',
  baseURL: 'https://api.example.com',
  groupBy: 'tag',
  schemas: false,
});

console.log(`${result.written} files written, ${result.skipped} unchanged`);
```

## Using the Generated SDK

```ts
import { createClient } from './generated/client';

const api = createClient({ baseURL: 'https://api.example.com' });

// Fully typed — params, body, and response types are inferred
const tasks = await api.tasks.list();
const task = await api.tasks.get(taskId);
const created = await api.tasks.create({ title: 'New task' });
```

## Custom Operation ID Normalization

The generator auto-cleans operationIds (strips controller prefixes, detects CRUD patterns). For more control:

### Static overrides

```ts
export default defineConfig({
  source: './openapi.json',
  operationIds: {
    overrides: {
      listTasks: 'fetchAll',
      getTask: 'findById',
    },
  },
});
```

### Transform function

The transform receives the auto-cleaned name and a full `OperationContext`:

```ts
export default defineConfig({
  source: './openapi.json',
  operationIds: {
    transform: (cleaned, ctx) => {
      // ctx.operationId  — raw operationId from the spec
      // ctx.method       — GET, POST, PUT, DELETE, PATCH
      // ctx.path         — /v1/tasks/{id}
      // ctx.tags         — ['tasks']
      // ctx.hasBody      — whether the operation has a request body
      return cleaned;
    },
  },
});
```

## Framework Adapters

Built-in adapters handle operationId quirks for common backend frameworks. Import from `@vertz/openapi/adapters`:

### FastAPI

FastAPI generates operationIds like `list_tasks_tasks_get` (function name + route + verb). The adapter strips the route+verb suffix and handles API version prefixes.

```ts
import { defineConfig } from '@vertz/openapi';
import { fastapi } from '@vertz/openapi/adapters';

export default defineConfig({
  source: './openapi.json',
  output: './src/generated',
  operationIds: fastapi(),
});
```

| FastAPI operationId          | Path             | Result           |
| ---------------------------- | ---------------- | ---------------- |
| `list_tasks_tasks_get`       | `/tasks`         | `list_tasks`     |
| `get_user_v1_users__id__get` | `/v1/users/{id}` | `get_user_v1`    |
| `create_task_v2_tasks_post`  | `/v2/tasks`      | `create_task_v2` |

### NestJS

NestJS (`@nestjs/swagger`) generates operationIds like `TasksController_findAll`. The adapter strips the Controller prefix.

```ts
import { defineConfig } from '@vertz/openapi';
import { nestjs } from '@vertz/openapi/adapters';

export default defineConfig({
  source: './openapi.json',
  output: './src/generated',
  operationIds: nestjs(),
});
```

| NestJS operationId        | Result    |
| ------------------------- | --------- |
| `TasksController_findAll` | `findAll` |
| `UsersController.getById` | `getById` |

### Writing a Custom Adapter

An adapter is just a function that returns `{ transform }`:

```ts
function myFramework() {
  return {
    transform: (cleaned, ctx) => {
      // Your logic here using ctx.operationId, ctx.method, ctx.path, etc.
      return cleaned;
    },
  };
}

export default defineConfig({
  operationIds: myFramework(),
});
```

## Incremental Writes

The generator only writes files whose content has changed (SHA-256 comparison). Unchanged files are left untouched, so downstream tools (watchers, bundlers) aren't triggered unnecessarily. Stale files are automatically removed.

## Supported Specs

- OpenAPI 3.0.x
- OpenAPI 3.1.x
- JSON and YAML formats
- File paths and URLs
