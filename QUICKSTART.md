# Vertz Quickstart — 5 Minutes to Your First App

Get a working Vertz full-stack app running in under 5 minutes. Copy-paste friendly.

## Prerequisites

- [Bun](https://bun.sh) installed
- That's it!

## Step 1: Create Your App

```bash
npx @vertz/create-vertz-app my-app
cd my-app
```

This creates a new Vertz project with:
- A full-stack app (API + UI)
- SQLite database with auto-migrations
- A tasks CRUD entity
- Themed UI with `@vertz/theme-shadcn`
- TypeScript configured

## Step 2: Install Dependencies

```bash
bun install
```

## Step 3: Generate Types

```bash
bun run codegen
```

This generates the typed client at `.vertz/generated/` — used by the UI to call the API with full type safety.

## Step 4: Start the Dev Server

```bash
bun run dev
```

You should see:

```
Server running at http://localhost:3000/api
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the task list UI.

## Step 5: Test the API

Open another terminal and try:

```bash
# List tasks
curl http://localhost:3000/api/tasks

# Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Learn Vertz"}'

# List tasks again — your new task is there
curl http://localhost:3000/api/tasks
```

## What You Got

Your app includes:

```
my-app/
├── src/
│   ├── api/
│   │   ├── server.ts              # createServer with entities + db
│   │   ├── schema.ts              # Database schema (tasks table)
│   │   ├── db.ts                  # SQLite adapter
│   │   └── entities/
│   │       └── tasks.entity.ts    # Tasks entity with CRUD access
│   ├── pages/
│   │   └── home.tsx               # Task list UI page
│   ├── styles/
│   │   └── theme.ts               # Theme configuration
│   ├── app.tsx                    # App shell (SSR + theme)
│   ├── client.ts                  # Typed API client
│   └── entry-client.ts            # Client-side mount
├── vertz.config.ts
├── bunfig.toml
├── package.json
└── tsconfig.json
```

## Step 6: Add a New Entity

Create a new entity by adding a table to the schema. Open `src/api/schema.ts` and add:

```typescript
import { d } from '@vertz/db';

export const tasksTable = d.table('tasks', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

export const tasksModel = d.model(tasksTable);

// Add a new table ↓
export const notesTable = d.table('notes', {
  id: d.uuid().primary({ generate: 'uuid' }),
  content: d.text(),
  createdAt: d.timestamp().default('now').readOnly(),
});

export const notesModel = d.model(notesTable);
```

Create the entity at `src/api/entities/notes.entity.ts`:

```typescript
import { entity } from '@vertz/server';
import { notesModel } from '../schema';

export const notes = entity('notes', {
  model: notesModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
```

Register it in `src/api/server.ts`:

```typescript
import { createServer } from '@vertz/server';
import { db } from './db';
import { tasks } from './entities/tasks.entity';
import { notes } from './entities/notes.entity';  // ← Add this

const app = createServer({
  basePath: '/api',
  entities: [tasks, notes],  // ← Add notes here
  db,
});

export default app;
```

Re-run codegen to update the typed client, then restart the dev server:

```bash
bun run codegen
bun run dev
```

Test it:

```bash
curl -X POST http://localhost:3000/api/notes \
  -H 'Content-Type: application/json' \
  -d '{"content":"My first note"}'

curl http://localhost:3000/api/notes
```

## Next Steps

You now have:
- A working full-stack app
- Type-safe API with auto-generated client
- SQLite database with auto-migrations
- Themed UI with reactive components

**Learn more:**

- [Vision & Principles](./VISION.md)
- [Contributing Guide](./CONTRIBUTING.md)

---

**Something not working?** [Open an issue](https://github.com/vertz-dev/vertz/issues/new) — we'll fix it fast.
