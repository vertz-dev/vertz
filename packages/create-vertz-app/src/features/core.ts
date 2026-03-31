import { gitignoreTemplate, tsconfigTemplate } from '../templates/index.js';
import type { Feature, FeatureContext } from './types.js';

function claudeMdContent(ctx: FeatureContext): string {
  const isApiOnly = ctx.hasFeature('api') && !ctx.hasFeature('ui');
  const isUiOnly = ctx.hasFeature('ui') && !ctx.hasFeature('api');
  const isFullStack = ctx.hasFeature('api') && ctx.hasFeature('ui');

  const stackType = isApiOnly ? 'API-only' : isUiOnly ? 'UI-only' : 'full-stack TypeScript';

  const sections: string[] = [];

  // Header
  sections.push(`# ${ctx.projectName}

A ${stackType} application built with [Vertz](https://vertz.dev).

- Runtime: Bun
- Framework: Vertz
- Language: TypeScript (strict mode)
- Docs: https://docs.vertz.dev

## Development

\`\`\`bash
bun install && bun run dev
\`\`\``);

  // Project structure
  const structure: string[] = [];
  if (ctx.hasFeature('api')) {
    structure.push(
      'src/api/server.ts       # createServer({ entities, db })',
      'src/api/schema.ts       # d.table() + d.model() definitions',
      'src/api/db.ts           # createDb() with SQLite',
      'src/api/env.ts          # createEnv() with validated schema',
      'src/api/entities/*.ts   # entity() definitions (auto CRUD)',
    );
  }
  if (ctx.hasFeature('ui')) {
    structure.push(
      'src/app.tsx             # App root with ThemeProvider',
      'src/entry-client.ts     # mount() with HMR',
      'src/styles/theme.ts     # configureTheme + registerTheme',
    );
  }
  if (ctx.hasFeature('router')) {
    structure.push(
      'src/router.tsx          # defineRoutes() + createRouter()',
      'src/pages/*.tsx         # Page components',
    );
  }
  if (ctx.hasFeature('client')) {
    structure.push(
      'src/client.ts           # createClient() from codegen',
    );
  }

  if (structure.length > 0) {
    sections.push(`\n## Project Structure\n\n\`\`\`\n${structure.join('\n')}\n\`\`\``);
  }

  // API quick reference
  if (ctx.hasFeature('api')) {
    sections.push(`
## API Quick Reference

All routes are prefixed with \`/api/\`:
- \`GET /api/{entity}\` — list (returns \`{ items, total, limit, hasNextPage }\`)
- \`POST /api/{entity}\` — create
- \`GET /api/{entity}/:id\` — get by ID
- \`PATCH /api/{entity}/:id\` — update (NOT PUT)
- \`DELETE /api/{entity}/:id\` — delete

### Adding an entity

\`\`\`ts
// src/api/schema.ts
import { d } from 'vertz/db';

export const postsTable = d.table('posts', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text(),
  published: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
});
export const postsModel = d.model(postsTable);
\`\`\`

\`\`\`ts
// src/api/entities/posts.entity.ts
import { entity } from 'vertz/server';
import { postsModel } from '../schema';

export const posts = entity('posts', {
  model: postsModel,
  access: { list: () => true, get: () => true, create: () => true, update: () => true, delete: () => true },
});
\`\`\`

Then register in \`src/api/server.ts\`:
\`\`\`ts
import { posts } from './entities/posts.entity';
// Add to entities array: entities: [tasks, posts]
\`\`\`

### Services (custom endpoints)

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

### Field types

\`d.uuid()\`, \`d.text()\`, \`d.boolean()\`, \`d.integer()\`, \`d.timestamp()\`, \`d.enum(['a','b'])\`

Modifiers: \`.primary()\`, \`.default(value)\`, \`.readOnly()\`, \`.autoUpdate()\`, \`.unique()\`, \`.min(n)\`, \`.max(n)\`

**Important:** Fields are required by default. There is no \`.optional()\` modifier on \`d\` fields. To make a field optional, use \`.default(value)\` instead.

### DB

- \`migrations: { autoApply: true }\` — tables are created/updated automatically on dev server start
- SQLite is the default dev database (\`dialect: 'sqlite'\`)

### Codegen

After adding/modifying entities, run \`bun run codegen\` (or restart dev server) to regenerate the typed client SDK in \`.vertz/generated/\`. The client (\`src/client.ts\`) imports from \`#generated\` which maps to this output.

### HTTP methods

Vertz entities use **PATCH** for updates (not PUT). If the spec requires PUT, the dev server or a middleware must rewrite PUT → PATCH.

List responses return \`{ items: T[], total, limit, nextCursor, hasNextPage }\`, not a plain array.`);
  }

  // UI quick reference
  if (ctx.hasFeature('ui')) {
    sections.push(`
## UI Quick Reference

The Vertz compiler transforms your code to be reactive automatically.

- \`let count = 0\` → signal (mutations trigger DOM updates)
- \`const doubled = count * 2\` → computed (auto-derived)
- Components run once — no re-renders, no hooks

### Styling

\`\`\`tsx
import { css } from 'vertz/ui';
const styles = css({
  container: ['flex', 'flex-col', 'gap:4', 'p:6'],
});
<div className={styles.container}>...</div>
\`\`\`

### Data fetching

\`\`\`tsx
import { query } from 'vertz/ui';
const tasks = query(api.tasks.list());
// tasks.loading, tasks.error, tasks.data.items — all reactive
\`\`\`

### Theme components

\`\`\`tsx
import { Button, Input, Dialog } from '@vertz/ui/components';
<Button intent="primary" size="md">Submit</Button>
\`\`\``);
  }

  if (ctx.hasFeature('router')) {
    sections.push(`
## Routing

Routes in \`src/router.tsx\`. Pages access router via hooks:

\`\`\`tsx
import { useRouter, useParams } from 'vertz/ui';
const { navigate } = useRouter();
const { id } = useParams<'/tasks/:id'>();
\`\`\``);
  }

  if (isUiOnly) {
    sections.push(`
## Adding a Backend

See https://docs.vertz.dev/guides/server/overview`);
  }

  // Conventions
  sections.push(`
## Conventions

- See \`.claude/rules/\` for detailed conventions
- Docs: https://docs.vertz.dev`);

  return sections.join('\n') + '\n';
}

export const coreFeature: Feature = {
  name: 'core',
  dependencies: [],

  files(ctx) {
    return [
      { path: 'tsconfig.json', content: tsconfigTemplate() },
      { path: '.gitignore', content: gitignoreTemplate() },
      { path: 'CLAUDE.md', content: claudeMdContent(ctx) },
    ];
  },

  packages: {
    dependencies: {
      vertz: '^0.2.0',
    },
    devDependencies: {
      'bun-types': '^1.0.0',
      typescript: '^5.8.0',
    },
    scripts: {},
  },
};
