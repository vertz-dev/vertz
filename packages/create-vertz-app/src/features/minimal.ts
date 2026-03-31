import type { Feature, FeatureContext } from './types.js';

/**
 * Minimal scaffold — follows framework best practices (vertz dev, not dev.ts).
 * Optimized for AI agents: fewest files, CLI does the heavy lifting.
 */

function minimalTsconfig(): string {
  return JSON.stringify({
    compilerOptions: {
      strict: true,
      jsx: 'react-jsx',
      jsxImportSource: '@vertz/ui',
      moduleResolution: 'bundler',
      target: 'ESNext',
      module: 'ESNext',
    },
  }, null, 2);
}

function minimalVertzConfig(): string {
  return `/** @type {import('@vertz/compiler').VertzConfig} */
export default {
  compiler: {
    entryFile: 'src/api/server.ts',
  },
};

/** @type {import('@vertz/codegen').CodegenConfig} */
export const codegen = {
  generators: ['typescript'],
};
`;
}

function minimalAppTsx(): string {
  return `export function App() {
  return <h1>Vertz App</h1>;
}
`;
}

function minimalClaudeMd(ctx: FeatureContext): string {
  return `# ${ctx.projectName}

Vertz full-stack TypeScript app. Dependencies are pre-installed.

## Quick start

\`\`\`bash
bun run dev    # starts on http://localhost:3000
\`\`\`

## IMPORTANT: Use the Vertz CLI to add features

Do NOT create files manually for entities or pages. Use the CLI:

\`\`\`bash
# Preview what will be created:
bunx vertz add entity tasks --fields "title:text, description:text, status:text" --dry-run

# Apply — creates schema, entity, and registers in server:
bunx vertz add entity tasks --fields "title:text, description:text, status:text"

# See current project state:
bunx vertz inspect --json
\`\`\`

After the CLI creates the entity files, you only need to:
1. Create \`src/api/server.ts\` (if it doesn't exist) — see Server section below
2. Edit entity files to add validation hooks if needed
3. Edit \`src/app.tsx\` for the UI
4. Run \`bun run dev\`

## Project structure

\`\`\`
vertz.config.ts             # points to src/api/server.ts
src/api/server.ts           # createServer({ entities, db }) — YOU CREATE THIS
src/api/schema.ts           # d.table() + d.model() — CLI creates this
src/api/entities/*.entity.ts # entity() definitions — CLI creates these
src/app.tsx                 # UI root
\`\`\`

## Server (src/api/server.ts)

\`\`\`ts
import { createServer } from 'vertz/server';
import { createDb } from 'vertz/db';
import { tasksModel } from './schema';
import { tasks } from './entities/tasks.entity';

const db = createDb({
  dialect: 'sqlite',
  path: './data.db',
  models: { tasks: tasksModel },
  migrations: { autoApply: true },
});

const app = createServer({ basePath: '/api', entities: [tasks], db });
export default app;
\`\`\`

## Route conventions

All routes prefixed with \`/api/\`:
- \`GET /api/{entity}\` → list (returns \`{ items, total, limit, hasNextPage }\`)
- \`POST /api/{entity}\` → create
- \`GET /api/{entity}/:id\` → get
- \`PATCH /api/{entity}/:id\` → update (NOT PUT)
- \`DELETE /api/{entity}/:id\` → delete

## Custom endpoints (services)

\`\`\`ts
import { service } from 'vertz/server';
import { s } from 'vertz/schema';
const health = service('health', {
  access: { check: () => true },
  actions: { check: { method: 'GET', response: s.object({ status: s.string() }), handler: async () => ({ status: 'ok' }) } },
});
// → GET /api/health/check
\`\`\`

Register services in server.ts: \`createServer({ entities: [...], services: [health], db })\`

## Validation (before hooks)

\`\`\`ts
import { entity, BadRequestException } from 'vertz/server';
export const tasks = entity('tasks', {
  model: tasksModel,
  access: { list: () => true, get: () => true, create: () => true, update: () => true, delete: () => true },
  before: {
    create: (data) => {
      if (!data.title?.trim()) throw new BadRequestException('title is required');
      if (data.title.length > 100) throw new BadRequestException('title too long');
      return data;
    },
  },
});
\`\`\`

\`BadRequestException\` returns HTTP 400. Import from \`vertz/server\`.

## Schema reference

Types: \`d.uuid()\` \`d.text()\` \`d.boolean()\` \`d.integer()\` \`d.timestamp()\`
Modifiers: \`.primary()\` \`.default(v)\` \`.readOnly()\` \`.min(n)\` \`.max(n)\`
No \`.optional()\` — use \`.default(value)\` instead.

## UI — reactivity is automatic

\`let count = 0\` → signal. \`count++\` updates DOM. Components run once, no re-renders.
`;
}

function addEntitySkill(): string {
  return `---
description: Add a new entity with schema, CRUD endpoints, and DB registration
---

# Add Entity

## Step 1: Run the CLI

\`\`\`bash
bunx vertz add entity {entityName} --fields "title:text, status:text" --dry-run
\`\`\`

Review the plan. If it looks good, run without --dry-run:

\`\`\`bash
bunx vertz add entity {entityName} --fields "title:text, status:text"
\`\`\`

## Step 2: Create or update src/api/server.ts

\`\`\`ts
import { createServer } from 'vertz/server';
import { createDb } from 'vertz/db';
import { {entityName}Model } from './schema';
import { {entityName} } from './entities/{entityName}.entity';

const db = createDb({
  dialect: 'sqlite',
  path: './data.db',
  models: { {entityName}: {entityName}Model },
  migrations: { autoApply: true },
});

const app = createServer({ basePath: '/api', entities: [{entityName}], db });
export default app;
\`\`\`

## Step 3: Add validation if needed

Edit \`src/api/entities/{entityName}.entity.ts\` to add before hooks:

\`\`\`ts
import { entity, BadRequestException } from 'vertz/server';
// Add before: { create: (data) => { ... } } for validation
\`\`\`

## Step 4: Start the server

\`\`\`bash
bun run dev
\`\`\`

## Routes generated

- \`GET /api/{entityName}\` → list
- \`POST /api/{entityName}\` → create
- \`GET /api/{entityName}/:id\` → get
- \`PATCH /api/{entityName}/:id\` → update (NOT PUT)
- \`DELETE /api/{entityName}/:id\` → delete
`;
}

function addServiceSkill(): string {
  return `---
description: Add a custom API endpoint (non-CRUD) using Vertz services
---

# Add Service

For custom endpoints that aren't entity CRUD, use a service.

## Create the service file

\`\`\`ts
// src/api/services/{serviceName}.service.ts
import { service } from 'vertz/server';
import { s } from 'vertz/schema';

export const {serviceName} = service('{serviceName}', {
  access: { {actionName}: () => true },
  actions: {
    {actionName}: {
      method: 'GET',
      response: s.object({ status: s.string() }),
      handler: async () => {
        return { status: 'ok' };
      },
    },
  },
});
\`\`\`

## Register in server.ts

\`\`\`ts
import { {serviceName} } from './services/{serviceName}.service';

const app = createServer({
  entities: [...],
  services: [{serviceName}],
  db,
});
\`\`\`

## Route generated

\`{METHOD} /api/{serviceName}/{actionName}\`
`;
}

export const minimalFeature: Feature = {
  name: 'minimal',
  dependencies: [],

  files(ctx) {
    return [
      { path: 'tsconfig.json', content: minimalTsconfig() },
      { path: 'vertz.config.ts', content: minimalVertzConfig() },
      { path: 'src/app.tsx', content: minimalAppTsx() },
      { path: 'CLAUDE.md', content: minimalClaudeMd(ctx) },
      { path: '.claude/skills/add-entity.md', content: addEntitySkill() },
      { path: '.claude/skills/add-service.md', content: addServiceSkill() },
    ];
  },

  packages: {
    dependencies: {
      vertz: '^0.2.0',
      '@vertz/theme-shadcn': '^0.2.0',
    },
    devDependencies: {
      '@vertz/cli': '^0.2.0',
      '@vertz/ui-compiler': '^0.2.0',
      'bun-types': '^1.0.0',
      typescript: '^5.8.0',
    },
    scripts: {
      dev: 'vertz dev',
      build: 'vertz build',
      start: 'vertz start',
      codegen: 'vertz codegen',
    },
  },
};
