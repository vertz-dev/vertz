import type { Feature, FeatureContext } from './types.js';

/**
 * Minimal scaffold — 5 files, commented templates.
 * Optimized for AI agents: fewest files, clearest path to working code.
 * Replaces the old handcrafted ax-bench scaffold that achieved 15 turns / 385K tokens.
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
 * Vertz Dev Server — entry point for development.
 *
 * INSTRUCTIONS FOR AI AGENTS:
 * 1. Create your schema in src/api/schema.ts
 * 2. Create your entities in src/api/entities/*.entity.ts
 * 3. Create your UI in src/app.tsx and src/pages/*.tsx
 * 4. Update the imports below to match your files
 * 5. Run: bun run dev
 *
 * This file handles DB setup, API server, and UI dev server.
 * Do NOT create separate db.ts or server.ts files.
 */

import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';
import { createServer } from 'vertz/server';
import { createDb } from 'vertz/db';
import { resolve } from 'path';

const PORT = Number(process.env.PORT ?? 4200);

// ── TODO: Update these imports to match your schema and entities ──
// import { yourModel } from './src/api/schema';
// import { yourEntity } from './src/api/entities/your.entity';

// ── Database (SQLite with auto-migration) ──
// const db = createDb({
//   dialect: 'sqlite',
//   path: './data.db',
//   models: { items: yourModel },
//   migrations: { autoApply: true },
// });

// ── API Server ──
// const app = createServer({ entities: [yourEntity], db });

// ── Dev Server (UI + API + SSR + HMR) ──
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
  return `/**
 * App shell — root component.
 * Replace this with your actual app UI.
 */
export function App() {
  return <h1>Vertz App</h1>;
}
`;
}

function minimalClaudeMd(ctx: FeatureContext): string {
  return `# ${ctx.projectName} — Vertz Quick Reference

Full docs: https://docs.vertz.dev

## This project is pre-configured

The scaffold includes \`package.json\`, \`tsconfig.json\`, \`dev.ts\`, and \`src/app.tsx\`.
Run \`bun install\` then \`bun run dev\` — it works out of the box.

**Your job:** create/edit files in \`src/\` — the scaffold handles everything else.

## How to add features

### UI-only (hello world, landing page)
Just edit \`src/app.tsx\`. No other files needed.

### Full-stack (API + DB + UI)
1. Create schema: \`src/api/schema.ts\`
2. Create entity: \`src/api/entities/your.entity.ts\`
3. Edit \`dev.ts\` — uncomment the imports and DB/server setup, update paths
4. Edit \`src/app.tsx\` for the UI

## dev.ts is your entry point

All DB and server setup goes in \`dev.ts\`. Do NOT create separate \`db.ts\` or \`server.ts\` files.
The template in \`dev.ts\` has commented sections — uncomment and adjust imports.

Key: use \`migrations: { autoApply: true }\` in \`createDb()\` — this auto-creates tables.

## Route conventions

All API routes are prefixed with \`/api/\`:
- Entities: \`GET /api/{entity}\`, \`POST /api/{entity}\`, \`GET /api/{entity}/:id\`, \`PATCH /api/{entity}/:id\`, \`DELETE /api/{entity}/:id\`
- Entities use **PATCH** for updates (not PUT). If the spec requires PUT, wrap the handler.
- List responses return \`{ items: T[], total, limit, nextCursor, hasNextPage }\`, not a plain array.
- For routes outside \`/api/\`, use Bun's native \`Bun.serve()\` directly.

## Schema

\`\`\`ts
// src/api/schema.ts
import { d } from 'vertz/db';

export const tasksTable = d.table('tasks', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text().min(1).max(100),
  description: d.text().default(''),
  status: d.text().default('todo'),
  createdAt: d.timestamp().default('now').readOnly(),
});

export const tasksModel = d.model(tasksTable);
\`\`\`

Field types: \`d.uuid()\`, \`d.text()\`, \`d.boolean()\`, \`d.integer()\`, \`d.timestamp()\`
Modifiers: \`.primary()\`, \`.default(value)\`, \`.readOnly()\`, \`.min(n)\`, \`.max(n)\`, \`.unique()\`

**Important:** No \`.optional()\` modifier. Use \`.default(value)\` instead.

## Entity

\`\`\`ts
// src/api/entities/tasks.entity.ts
import { entity } from 'vertz/server';
import { tasksModel } from '../schema';

export const tasks = entity('tasks', {
  model: tasksModel,
  access: { list: () => true, get: () => true, create: () => true, update: () => true, delete: () => true },
});
\`\`\`

## PUT → PATCH wrapper (if spec requires PUT)

\`\`\`ts
// In dev.ts, wrap app.handler:
const apiHandler = async (req: Request) => {
  if (req.method === 'PUT') {
    return app.handler(new Request(req.url, { method: 'PATCH', headers: req.headers, body: req.body }));
  }
  return app.handler(req);
};
// Pass apiHandler instead of app.handler to createBunDevServer
\`\`\`

## Reactivity (UI)

- \`let count = 0\` → signal. \`count++\` triggers DOM updates.
- \`const doubled = count * 2\` → computed.
- Components run once. No re-renders, no hooks.

## Services (standalone API endpoints)

\`\`\`ts
import { service } from 'vertz/server';
import { s } from 'vertz/schema';

const health = service('health', {
  access: { check: () => true },
  actions: {
    check: {
      method: 'GET',
      response: s.object({ status: s.string() }),
      handler: async () => ({ status: 'ok' }),
    },
  },
});
// Generates: GET /api/health/check
\`\`\`
`;
}

export const minimalFeature: Feature = {
  name: 'minimal',
  dependencies: [],

  files(ctx) {
    return [
      { path: 'package.json', content: minimalPackageJson(ctx) },
      { path: 'tsconfig.json', content: minimalTsconfig() },
      { path: 'dev.ts', content: minimalDevTs() },
      { path: 'src/app.tsx', content: minimalAppTsx() },
      { path: 'CLAUDE.md', content: minimalClaudeMd(ctx) },
    ];
  },
};
