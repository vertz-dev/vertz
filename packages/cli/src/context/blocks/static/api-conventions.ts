import type { ContextBlock } from '../../types';

export const apiConventionsBlock: ContextBlock = {
  id: 'api-conventions',
  title: 'API Development',
  category: 'api',
  priority: 1,
  content: `All Vertz packages are available through the \`vertz\` meta-package:

\`\`\`ts
import { createServer, entity, createEnv } from 'vertz/server';
import { s } from 'vertz/schema';
import { d, createDb } from 'vertz/db';
\`\`\`

### Route conventions

All routes prefixed with \`/api/\`:
- \`GET /api/{entity}\` — list (returns \`{ items, total, limit, hasNextPage }\`)
- \`POST /api/{entity}\` — create
- \`GET /api/{entity}/:id\` — get by ID
- \`PATCH /api/{entity}/:id\` — update (**PATCH**, not PUT)
- \`DELETE /api/{entity}/:id\` — delete

### Schema

\`\`\`ts
import { d } from 'vertz/db';

export const postsTable = d.table('posts', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text().min(1).max(100),
  body: d.text().default(''),
  published: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
});
export const postsModel = d.model(postsTable);
\`\`\`

Field types: \`d.uuid()\`, \`d.text()\`, \`d.boolean()\`, \`d.integer()\`, \`d.timestamp()\`, \`d.enum()\`
Modifiers: \`.primary()\`, \`.default()\`, \`.readOnly()\`, \`.min()\`, \`.max()\`, \`.unique()\`

**No \`.optional()\` modifier.** Use \`.default(value)\` instead.

### Entity

\`\`\`ts
import { entity } from 'vertz/server';
import { postsModel } from '../schema';

export const posts = entity('posts', {
  model: postsModel,
  access: { list: () => true, get: () => true, create: () => true, update: () => true, delete: () => true },
});
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
// → GET /api/health/check
\`\`\`

### DB

\`migrations: { autoApply: true }\` auto-creates tables on dev server start. SQLite default.`,
};
