# Entity Todo — vertz Full-Stack Demo

Define your data once. Get a typed API, typed client SDK, reactive UI, and SSR — all end-to-end type-safe.

```
schema → entity → SDK generation → reactive UI → SSR
```

## The Pipeline

### 1. Schema — define your data

```ts
// src/schema.ts
export const todosTable = d.table('todos', {
  id: d.uuid().primary(),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});
```

### 2. Entity — define your API

```ts
// src/entities.ts
export const todos = entity('todos', {
  model: d.model(todosTable),
  access: { list: () => true, get: () => true, create: () => true, update: () => true, delete: () => true },
});
```

This generates typed CRUD endpoints automatically — `GET /api/todos`, `POST /api/todos`, etc.

### 3. Generated SDK — typed client

```ts
// src/generated/entities/todos.ts (auto-generated)
export function createTodosSdk(client: Client) {
  return {
    list: (params?) => client.get<TodoListResponse>('/todos', { params }),
    get: (id) => client.get<Todo>(`/todos/${id}`),
    create: (body) => client.post<Todo>('/todos', body),
    update: (id, body) => client.patch<Todo>(`/todos/${id}`, body),
    delete: (id) => client.delete<Todo>(`/todos/${id}`),
  };
}
```

### 4. Reactive UI — `@vertz/ui`

```tsx
// src/pages/todo-list.tsx
const todosQuery = query(() => fetchTodos(), { key: 'todo-list' });
let isLoading = true;
let todoList: Todo[] = [];

effect(() => {
  isLoading = todosQuery.loading.value;
  todoList = todosQuery.data.value?.todos ?? [];
});

return (
  <div>
    {isLoading && <div>Loading...</div>}
    {todoList.map((todo) => <TodoItem key={todo.id} {...todo} />)}
  </div>
);
```

### 5. SSR — zero-config server rendering

```ts
// vite.config.ts
export default defineConfig({
  plugins: [vertzPlugin({ ssr: true })],
});
```

That's it. The framework auto-detects the entry point and renders the app server-side.

## File Structure

```
src/
  schema.ts              — d.table() data model
  entities.ts            — entity() API definition
  server.ts              — API server entry

  generated/             — Pre-committed SDK (bun run codegen to regenerate)
    client.ts            — Client interface + factory
    entities/todos.ts    — Typed CRUD methods
    index.ts             — Barrel export

  api/
    client.ts            — SDK instance
    mock-data.ts         — In-memory mock for dev/tests

  components/
    todo-item.tsx        — Single todo (checkbox, title, delete)
    todo-form.tsx        — Create form with validation

  pages/
    todo-list.tsx        — Main page: query() + list + form

  styles/
    theme.ts             — defineTheme() light/dark
    components.ts        — css(), variants() for buttons, forms

  app.tsx                — Root component + ThemeProvider
  index.ts               — Client entry (SSR-aware mount)
```

## Run it

```bash
bun run dev
```

This starts both the API server (port 3000) and the Vite dev server (port 5173) with a proxy for `/api`.

Open `http://localhost:5173` to see the app.

## Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start API + UI dev servers |
| `bun run dev:api` | Start API server only |
| `bun run dev:ui` | Start Vite UI only |
| `bun run codegen` | Regenerate SDK from entity definition |
| `bun run test` | Run all tests (API + UI + SSR) |

## What This Proves

This demo validates the complete vertz pipeline:

1. **Schema** → `d.table()` defines your data model
2. **Model** → `d.model()` creates typed CRUD schemas
3. **Entity** → `entity()` generates typed API endpoints
4. **Codegen** → `EntitySdkGenerator` produces a typed client SDK
5. **FetchClient** → Convenience methods (`get`, `post`, `patch`, `delete`) power the SDK
6. **Reactive UI** → `query()`, `form()`, `effect()` drive the interface
7. **SSR** → Zero-config server rendering with `vertzPlugin({ ssr: true })`

Define your data once. Everything else follows.
