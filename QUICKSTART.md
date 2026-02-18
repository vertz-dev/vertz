# Vertz Quickstart — 5 Minutes to Your First API

Get a working Vertz API server running in under 5 minutes. Copy-paste friendly.

## Prerequisites

- [Bun](https://bun.sh) installed (or Node.js 22+)
- That's it!

## Step 1: Create Your App

```bash
npx create-vertz-app my-api --example
cd my-api
```

This creates a new Vertz project with:
- ✅ A working health check endpoint
- ✅ TypeScript configured
- ✅ Environment validation
- ✅ All dependencies installed

## Step 2: Install Dependencies

```bash
bun install
```

(Or `npm install` if using Node)

## Step 3: Start the Server

```bash
bun run dev
```

You should see:

```
✓ Server running at http://localhost:3000/api
```

## Step 4: Test It

Open another terminal and try:

```bash
# Health check
curl http://localhost:3000/api/health

# Readiness check
curl http://localhost:3000/api/health/ready
```

You should see:

```json
{
  "status": "ok",
  "timestamp": "2026-02-18T16:41:00.000Z"
}
```

## What You Got

Your app includes:

```
my-api/
├── src/
│   ├── app.ts              # App configuration
│   ├── main.ts             # Entry point
│   ├── env.ts              # Environment validation
│   └── modules/
│       └── health/         # Example health module
│           ├── health.module-def.ts
│           ├── health.service.ts
│           ├── health.router.ts
│           └── health.module.ts
├── package.json
└── tsconfig.json
```

## Step 5: Add Your First Route

Let's add a new endpoint to the health module. Open `src/modules/health.router.ts` and add a new route:

```typescript
import { s } from '@vertz/schema';
import { healthDef } from './health.module-def.js';
import { healthService } from './health.service.js';

const HealthResponseSchema = s.object({
  status: s.string(),
  timestamp: s.string(),
});

export const healthRouter = healthDef
  .router({ prefix: '/health', inject: { healthService } })
  .get('/', {
    response: HealthResponseSchema,
    handler: (ctx) => ctx.healthService.check(),
  })
  .get('/ready', {
    response: s.object({ ready: s.boolean() }),
    handler: () => ({ ready: true }),
  })
  // Add this new route ↓
  .get('/ping', {
    response: s.object({ message: s.string() }),
    handler: () => ({ message: 'pong' }),
  });
```

Save the file. The dev server will automatically reload. Test it:

```bash
curl http://localhost:3000/api/health/ping
# {"message":"pong"}
```

## Step 6: Create a New Module

Now let's create a full module with business logic. Create a new file `src/modules/tasks/task.module-def.ts`:

```typescript
import { vertz } from '@vertz/core';

export const taskDef = vertz.moduleDef({ name: 'tasks' });
```

Create `src/modules/tasks/task.service.ts`:

```typescript
import { taskDef } from './task.module-def.js';

type Task = { id: string; title: string; done: boolean };

const tasks: Task[] = [
  { id: '1', title: 'Learn Vertz', done: false },
];

export const taskService = taskDef.service({
  methods: () => ({
    list: () => tasks,
    getById: (id: string) => tasks.find((t) => t.id === id),
    create: (title: string) => {
      const task = { id: String(Date.now()), title, done: false };
      tasks.push(task);
      return task;
    },
  }),
});
```

Create `src/modules/tasks/task.router.ts`:

```typescript
import { s } from '@vertz/schema';
import { taskDef } from './task.module-def.js';
import { taskService } from './task.service.js';

const TaskSchema = s.object({
  id: s.string(),
  title: s.string(),
  done: s.boolean(),
});

export const taskRouter = taskDef
  .router({ prefix: '/tasks', inject: { taskService } })
  .get('/', {
    response: s.array(TaskSchema),
    handler: (ctx) => ctx.taskService.list(),
  })
  .get('/:id', {
    params: s.object({ id: s.string() }),
    response: TaskSchema,
    handler: (ctx) => {
      const task = ctx.taskService.getById(ctx.params.id);
      if (!task) throw new Error('Task not found');
      return task;
    },
  })
  .post('/', {
    body: s.object({ title: s.string().min(1) }),
    response: TaskSchema,
    handler: (ctx) => ctx.taskService.create(ctx.body.title),
  });
```

Create `src/modules/tasks/task.module.ts`:

```typescript
import { vertz } from '@vertz/core';
import { taskDef } from './task.module-def.js';
import { taskRouter } from './task.router.js';
import { taskService } from './task.service.js';

export const taskModule = vertz.module(taskDef, {
  services: [taskService],
  routers: [taskRouter],
});
```

Now register the module in `src/app.ts`:

```typescript
import { vertz } from '@vertz/core';
import { healthModule } from './modules/health.module.js';
import { taskModule } from './modules/tasks/task.module.js';  // ← Add this

const app = vertz
  .app({ basePath: '/api' })
  .register(healthModule)
  .register(taskModule);  // ← Add this

export { app };
```

Save and test:

```bash
# List tasks
curl http://localhost:3000/api/tasks

# Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"Build something awesome"}'

# Get a task by ID (use the ID from the response above)
curl http://localhost:3000/api/tasks/1
```

## Next Steps

You now have:
- ✅ A working API server
- ✅ Type-safe routes with validation
- ✅ Module-based architecture
- ✅ In-memory data service

**Learn more:**

- [Full Documentation](https://docs.vertz.dev)
- [Vision & Principles](./VISION.md)
- [Task API Example](./examples/task-api)
- [Contributing Guide](./CONTRIBUTING.md)

**Ready for production?**

- Add a database with `@vertz/db`
- Add authentication with `@vertz/server`
- Deploy to Cloudflare Workers, Deno Deploy, or any runtime

---

**Something not working?** [Open an issue](https://github.com/vertz-dev/vertz/issues/new) — we'll fix it fast.
