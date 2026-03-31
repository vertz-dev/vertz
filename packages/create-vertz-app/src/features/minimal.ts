import type { Feature, FeatureContext } from './types.js';

/**
 * Minimal scaffold — 5 files, CLI-first workflow.
 * Optimized for AI agents: fewest files, CLI does the heavy lifting.
 */

function minimalPackageJson(ctx: FeatureContext): string {
  return JSON.stringify({
    name: ctx.projectName,
    version: '0.0.1',
    scripts: {
      dev: 'bun run dev.ts',
    },
    dependencies: {
      vertz: 'latest',
      '@vertz/ui-server': 'latest',
      '@vertz/ui': 'latest',
    },
    devDependencies: {
      '@vertz/cli': 'latest',
    },
  }, null, 2);
}

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

function minimalDevTs(): string {
  return `/**
 * Vertz Dev Server — single entry point for development.
 *
 * This file handles DB, API, and UI dev server.
 * Do NOT create separate db.ts or server.ts files — everything goes here.
 *
 * To add features, uncomment sections below and update imports.
 */

import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';
import { createServer } from 'vertz/server';
import { createDb } from 'vertz/db';
import { resolve } from 'path';

const PORT = Number(process.env.PORT ?? 4200);

// ── Uncomment and update when you add entities ──
// import { yourModel } from './src/api/schema';
// import { yourEntity } from './src/api/entities/your.entity';

// const db = createDb({
//   dialect: 'sqlite',
//   path: './data.db',
//   models: { items: yourModel },
//   migrations: { autoApply: true },
// });

// const app = createServer({ entities: [yourEntity], db });

const server = createBunDevServer({
  entry: resolve('./src/app.tsx'),
  port: PORT,
  // apiHandler: app.handler,  // uncomment when you have entities
  projectRoot: process.cwd(),
});

await server.start();
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

Vertz full-stack TypeScript app. Docs: https://docs.vertz.dev

## Quick start

\`\`\`bash
bun install && bun run dev    # starts on http://localhost:4200
\`\`\`

## How to build features

### Use the CLI for standard patterns:

\`\`\`bash
# Preview what will be created (dry-run):
vertz add entity tasks --fields "title:text, status:text, completed:boolean" --dry-run

# Apply:
vertz add entity tasks --fields "title:text, status:text, completed:boolean"

# Add a CRUD page:
vertz add page tasks --crud --for tasks

# See current project state:
vertz inspect --json
\`\`\`

The CLI creates schema, entity, and registers everything in dev.ts automatically.

### Manual editing — for custom logic only:

- \`dev.ts\` — server config (all DB + API setup lives here, nowhere else)
- \`src/app.tsx\` — UI root
- \`src/api/schema.ts\` — table definitions
- \`src/api/entities/*.entity.ts\` — entity CRUD + access rules

## Route conventions

All API routes prefixed with \`/api/\`:
- \`GET /api/{entity}\` → list (returns \`{ items, total, limit, hasNextPage }\`)
- \`POST /api/{entity}\` → create
- \`GET /api/{entity}/:id\` → get
- \`PATCH /api/{entity}/:id\` → update (NOT PUT)
- \`DELETE /api/{entity}/:id\` → delete

For custom non-CRUD endpoints, use services:
\`\`\`ts
import { service } from 'vertz/server';
import { s } from 'vertz/schema';
const health = service('health', {
  access: { check: () => true },
  actions: { check: { method: 'GET', response: s.object({ status: s.string() }), handler: async () => ({ status: 'ok' }) } },
});
// → GET /api/health/check
\`\`\`

## Schema reference

\`\`\`ts
import { d } from 'vertz/db';
export const tasksTable = d.table('tasks', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text().min(1).max(100),
  status: d.text().default('todo'),
  createdAt: d.timestamp().default('now').readOnly(),
});
export const tasksModel = d.model(tasksTable);
\`\`\`

Types: \`d.uuid()\` \`d.text()\` \`d.boolean()\` \`d.integer()\` \`d.timestamp()\`
Modifiers: \`.primary()\` \`.default(v)\` \`.readOnly()\` \`.min(n)\` \`.max(n)\`
No \`.optional()\` — use \`.default(value)\` instead.

## Entity reference

\`\`\`ts
import { entity } from 'vertz/server';
import { tasksModel } from '../schema';
export const tasks = entity('tasks', {
  model: tasksModel,
  access: { list: () => true, get: () => true, create: () => true, update: () => true, delete: () => true },
});
\`\`\`

## UI — reactivity is automatic

\`let count = 0\` → signal. \`count++\` updates DOM. Components run once, no re-renders.
`;
}

export const minimalFeature: Feature = {
  name: 'minimal',
  dependencies: [],

  files(ctx) {
    return [
      { path: 'tsconfig.json', content: minimalTsconfig() },
      { path: 'dev.ts', content: minimalDevTs() },
      { path: 'src/app.tsx', content: minimalAppTsx() },
      { path: 'CLAUDE.md', content: minimalClaudeMd(ctx) },
    ];
  },

  packages: {
    dependencies: {
      vertz: 'latest',
      '@vertz/ui-server': 'latest',
      '@vertz/ui': 'latest',
    },
    devDependencies: {
      '@vertz/cli': 'latest',
    },
    scripts: {
      dev: 'bun run dev.ts',
    },
  },
};
