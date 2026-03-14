# Electrobun Notes — End-to-End Type Safety Validation

> **Status:** Draft
> **Author:** viniciusdacal
> **Date:** 2026-03-14
> **Related:** VISION.md, MANIFESTO.md, examples/entity-todo

## Problem

Vertz promises end-to-end type safety from database to browser: *"One type system. One set of conventions. One source of truth that flows through every layer."* This claim needs a concrete, runnable validation — a real application where types flow from schema definition through entity, codegen, client SDK, and UI components without any manual type wiring.

### Why Now / Incremental Value Over entity-todo

The existing `entity-todo` example exercises the Vertz stack but was built iteratively as packages matured. It has accumulated workarounds (Cloudflare D1 adapter, manual mock data, wrangler deployment) that obscure the core type-safety story. This PoC is purpose-built to validate one thing: **does a schema change propagate compile errors through every layer?**

Additionally, this PoC validates Vertz running inside a desktop app shell (Electrobun), proving the framework is runtime-agnostic — it works wherever Bun runs, not just Cloudflare Workers.

### Primary Goal

**End-to-end type safety is the primary goal.** Electrobun integration is secondary — it demonstrates runtime agnosticism and provides a concrete demo target (Vision Principle 6: "If you can't demo it, it's not done"), but the PoC succeeds if types flow correctly even without the desktop shell. Phase 4 (Electrobun) is structured as an independent, droppable phase.

## API Surface

### 1. Schema Definition (`src/api/schema.ts`)

```typescript
import { d } from '@vertz/db';

export const notesTable = d.table('notes', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text(),
  content: d.text().default(''),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

export const notesModel = d.model(notesTable);
```

### 2. Entity Definition (`src/api/entities/notes.entity.ts`)

```typescript
import { entity } from '@vertz/server';
import { rules } from '@vertz/server';
import { notesModel } from '../schema';

export const notes = entity('notes', {
  model: notesModel,
  access: {
    list: rules.public,
    get: rules.public,
    create: rules.public,
    update: rules.public,
    delete: rules.public,
  },
});
```

### 3. Server (`src/api/server.ts`)

```typescript
import { createServer } from '@vertz/server';
import { notes } from './entities/notes.entity';
import { createNotesDb } from './db';

const app = createServer({
  basePath: '/api',
  entities: [notes],
  db: await createNotesDb(),
});

export default app;
```

### 4. Database (`src/api/db.ts`)

```typescript
import { createSqliteAdapter } from '@vertz/db/sqlite';
import { notesTable } from './schema';
import path from 'node:path';

export async function createNotesDb() {
  return await createSqliteAdapter({
    schema: notesTable,
    dbPath: path.join(import.meta.dir, '..', '..', 'data', 'notes.db'),
    migrations: { autoApply: true },
  });
}
```

> **Note:** `createSqliteAdapter` accepts a single `TableDef` via `schema` (not a model or record of tables). This is the single-entity adapter path — sufficient for this PoC. For multi-entity apps, use the `createDb()` / `DatabaseClient` pattern instead.

### 5. Vertz Config (`vertz.config.ts`)

```typescript
/** @type {import('@vertz/compiler').VertzConfig} */
export default {
  compiler: {
    entryFile: 'src/api/server.ts',
  },
};

/** @type {import('@vertz/codegen').CodegenConfig} */
export const codegen = {
  generators: ['typescript'],
};
```

The compiler statically analyzes `entryFile` to discover entity definitions. Codegen uses this to generate the typed client SDK at `.vertz/generated/client.ts`.

### 6. Client SDK (`src/api/client.ts`)

```typescript
import { createClient } from '#generated';
export type * from '#generated/types';

export const api = createClient();
```

> **How `#generated` works:** The `package.json` `"imports"` field maps `#generated` to `.vertz/generated/client.ts`. Running `bun run codegen` generates this file from the entity definitions. The import map is set up once in `package.json`:
> ```json
> "imports": {
>   "#generated": "./.vertz/generated/client.ts",
>   "#generated/types": "./.vertz/generated/types/index.ts"
> }
> ```

Usage — all fully typed:
```typescript
api.notes.list()           // → QueryDescriptor (pass to query())
api.notes.get(id)          // → QueryDescriptor
api.notes.create(data)     // → MutationDescriptor (pass reference to form())
api.notes.update(id, data) // → MutationDescriptor
api.notes.delete(id)       // → MutationDescriptor
```

> **Convention:** `query()` takes a descriptor instance (call the method: `query(api.notes.list())`), while `form()` takes a mutation factory reference (pass without calling: `form(api.notes.create, opts)`). This is because `query()` executes immediately, while `form()` defers execution until submission.

### 7. UI — Notes List Page (`src/pages/notes-list.tsx`)

```typescript
import { query, queryMatch } from '@vertz/ui';
import { api } from '../api/client';
import { NoteForm } from '../components/note-form';

export function NotesListPage() {
  const notesQuery = query(api.notes.list());

  const content = queryMatch(notesQuery, {
    loading: () => <div class="loading">Loading notes...</div>,
    error: (err) => <div class="error">Error: {err.message}</div>,
    data: (response) => (
      <ul class="notes-list">
        {response.items.map((note) => (
          <li key={note.id}>
            <strong>{note.title}</strong>
            <p>{note.content}</p>
          </li>
        ))}
      </ul>
    ),
  });

  return (
    <div class="notes-page">
      <h1>Notes</h1>
      <NoteForm onSuccess={() => notesQuery.refetch()} />
      {content}
    </div>
  );
}
```

### 8. UI — Note Form (`src/components/note-form.tsx`)

```typescript
import { form } from '@vertz/ui';
import { api } from '../api/client';

interface NoteFormProps {
  onSuccess?: () => void;
}

export function NoteForm({ onSuccess }: NoteFormProps) {
  const noteForm = form(api.notes.create, { onSuccess });

  return (
    <form action={noteForm.action} method={noteForm.method} onSubmit={noteForm.onSubmit}>
      <input name={noteForm.fields.title} placeholder="Note title" />
      <span class="error">{noteForm.title.error}</span>
      <textarea name={noteForm.fields.content} placeholder="Write something..." />
      <button type="submit" disabled={noteForm.submitting}>
        {noteForm.submitting ? 'Saving...' : 'Add Note'}
      </button>
    </form>
  );
}
```

> **Type-safe field names:** `noteForm.fields.title` is typed from the schema — renaming the field in the schema produces a compile error here. Using raw strings (`name="title"`) would break the type-safety chain.

### 9. Electrobun Main Process (`src/bun/index.ts`)

```typescript
import { BrowserWindow } from 'electrobun/bun';

// Start Vertz API server in the same Bun process
const { default: app } = await import('../api/server');
const handle = await app.listen(0); // ephemeral port avoids conflicts

const mainWindow = new BrowserWindow({
  title: 'Vertz Notes',
  url: `http://localhost:${handle.port}`,
  frame: { width: 900, height: 700, x: 200, y: 200 },
});

console.log(`Vertz Notes running at http://localhost:${handle.port}`);
```

> **Rendering approach:** This PoC uses client-only rendering (SPA). The Electrobun main process runs `Bun.serve()` via `app.listen()` which serves both the API endpoints and a static `index.html` for non-API routes. No SSR — this keeps the Electrobun integration simple and avoids the complexity of `createBunDevServer` inside the main process.

## Type Flow Map

The complete type-safe chain:

```
d.text()                          → TypeScript `string`
  ↓
notesTable.title                  → Column<string>
  ↓
notesModel                        → ModelDef<{ title: string; ... }>
  ↓
entity('notes', { model })        → EntityDefinition<NotesModel>
  ↓
codegen (static analysis)         → Generated client SDK
  ↓
api.notes.create(data)            → MutationDescriptor<Note>
  ↓                                  (data is typed: { title: string; content?: string })
form(api.notes.create)            → FormState with per-field signals
  ↓                                  (noteForm.fields.title is typed, noteForm.title.error is typed)
query(api.notes.list())           → QueryDescriptor<{ items: Note[]; total: number }>
  ↓
queryMatch(query, handlers)       → Type-narrowed data in each handler
  ↓
JSX: {response.items[0].title}    → Compiler verifies `title` exists on Note
```

**Zero manual type wiring.** Every type is inferred from the schema definition and flows automatically through codegen.

### Negative Type Tests (compile-time validation)

```typescript
// Input shape validation:

// @ts-expect-error — 'titlee' does not exist on Note
api.notes.create({ titlee: 'test' });

// @ts-expect-error — 'id' is read-only, cannot be set on create
api.notes.create({ id: '123', title: 'test' });

// @ts-expect-error — 'completed' field doesn't exist on notes schema
api.notes.update(id, { completed: true });

// @ts-expect-error — title must be string, not number
api.notes.create({ title: 123 });

// Response shape validation:

// @ts-expect-error — 'completed' does not exist on Note response
const bad: boolean = response.items[0].completed;
```

## Manifesto Alignment

| Principle | How This PoC Validates It |
|---|---|
| **Type Safety Wins** | Types flow from `d.text()` to JSX without manual wiring. The compiler catches mismatches. |
| **One Way to Do Things** | Schema → entity → codegen → client → UI. No alternatives, no ambiguity. |
| **Production-Ready by Default** | SQLite works locally, codegen generates validated SDK, forms include progressive enhancement. |
| **Backend to Frontend** | The entire chain is one type system. Change `title` to `name` in schema and the compiler breaks every consumer. |
| **Explicit over Implicit** | Every layer is visible: schema file, entity file, generated SDK, component code. |
| **Compile-Time over Runtime** | Negative type tests prove the compiler catches errors before runtime. |

## Non-Goals

- **Auth / access control** — all operations are `rules.public`. This PoC validates type safety, not authorization.
- **Electrobun typed RPC** — The Electrobun shell just wraps the web app. We don't exercise Electrobun's bun↔webview RPC. That's a separate concern.
- **Production deployment** — No bundling, signing, or distribution. Dev mode only.
- **Multi-window / native features** — Single window pointing at localhost. No tray, no menus, no native dialogs.
- **Styling polish** — Functional UI with basic theme. Not a design showcase.
- **Routing** — Single-page with list + inline form. No multi-page routing needed to validate type safety.
- **Update / delete UI** — The API supports all CRUD operations and they are tested at the API level. The UI only surfaces list and create to keep scope minimal.
- **SSR** — Client-only rendering (SPA). SSR is a deployment concern, not a type-safety concern.

## Unknowns

1. **Electrobun + Bun workspace resolution** — Electrobun apps expect `electrobun` as a dependency. Inside a Bun monorepo workspace, Electrobun's CLI (`electrobun dev`) needs to find its binary. Hoisting may place it in the root `node_modules/`, but Electrobun's CLI may look locally.
   - **Resolution:** Phase 4 starts with a resolution spike: run `npx electrobun init` in the example directory and verify `electrobun dev` works. If workspace resolution fails, create a standalone directory with `file:` references to local packages.

2. **Vertz API server in Electrobun main process** — The main process runs on Bun, so `app.listen()` should work. But Electrobun's event loop may have constraints we don't know about.
   - **Resolution:** Phase 4 spike validates `Bun.serve()` works inside the Electrobun process. If it doesn't, fall back to spawning the server as a child process.

3. **Codegen maturity** — The codegen pipeline must produce fully typed `QueryDescriptor` / `MutationDescriptor` outputs for this PoC to work. If the codegen has gaps, Phase 2 is blocked.
   - **Resolution:** Before starting Phase 2, verify codegen output on the existing `entity-todo` example (`cd examples/entity-todo && bun run codegen`). If it works there, it works here.

## E2E Acceptance Test

The definitive test that type safety works end-to-end:

```typescript
describe('Feature: End-to-end type safety', () => {
  describe('Given a notes schema with title (string) and content (string)', () => {
    describe('When codegen generates the client SDK', () => {
      it('Then api.notes.create() accepts { title: string; content?: string }', () => {
        const descriptor = api.notes.create({ title: 'Test', content: 'Body' });
        expect(descriptor).toBeDefined();
      });

      it('Then api.notes.create() rejects unknown fields at compile time', () => {
        // @ts-expect-error — 'unknown' does not exist
        api.notes.create({ title: 'Test', unknown: true });
      });
    });

    describe('When querying notes via the client SDK', () => {
      it('Then the response items have typed title and content fields', async () => {
        const result = await api.notes.list();
        if (result.ok) {
          const note = result.data.items[0];
          const title: string = note.title;
          const content: string = note.content;
          expect(typeof title).toBe('string');
          expect(typeof content).toBe('string');
        }
      });

      it('Then accessing non-existent fields fails at compile time', () => {
        // @ts-expect-error — 'completed' does not exist on Note
        const bad = result.data.items[0].completed;
      });
    });

    describe('When using form() with api.notes.create', () => {
      it('Then form field names are typed from the schema', () => {
        const noteForm = form(api.notes.create, {});
        // Type-safe field name access
        const titleField: string = noteForm.fields.title;
        const contentField: string = noteForm.fields.content;
        expect(titleField).toBe('title');
        expect(contentField).toBe('content');
      });
    });

    describe('When renaming title to heading in the schema', () => {
      it('Then bun run typecheck reports errors at every consumer', () => {
        // This is verified manually:
        // 1. Rename `title: d.text()` to `heading: d.text()` in schema.ts
        // 2. Run `bun run codegen && bun run typecheck`
        // 3. Verify compile errors in: client SDK, note-form.tsx, notes-list.tsx
        // 4. Revert the rename
      });
    });
  });

  describe('Given the Electrobun desktop shell', () => {
    describe('When starting the app with `electrobun dev`', () => {
      // Manual verification — Electrobun doesn't expose a test harness
      // for BrowserWindow assertions. Verify by:
      // 1. Run `electrobun dev` in examples/electrobun-notes
      // 2. Confirm: native window opens
      // 3. Confirm: notes UI renders in the window
      // 4. Confirm: creating a note via the form works
    });
  });
});
```

## Implementation Plan

### Phase 1: Schema + Entity + API Server (backend foundation)

**Goal:** Vertz API server running with notes entity, SQLite database, and passing CRUD tests.

**Acceptance Criteria:**
```typescript
describe('Given a Vertz server with notes entity', () => {
  let server: ServerHandle;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createTestServer(); // in-memory SQLite
    server = await app.listen(0);
    baseUrl = `http://localhost:${server.port}`;
  });

  afterAll(() => server.close());

  describe('When creating a note via POST /api/notes', () => {
    it('Then returns the created note with id, title, content, timestamps', async () => {
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Note', content: 'Hello world' }),
      });
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.id).toBeDefined();
      expect(body.title).toBe('Test Note');
      expect(body.content).toBe('Hello world');
      expect(body.createdAt).toBeDefined();
    });
  });

  describe('When listing notes via GET /api/notes', () => {
    it('Then returns items array with created notes', async () => {
      const res = await fetch(`${baseUrl}/api/notes`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.items).toBeInstanceOf(Array);
      expect(body.items.length).toBeGreaterThan(0);
      expect(body.items[0].title).toBe('Test Note');
    });
  });

  describe('When updating a note via PATCH /api/notes/:id', () => {
    it('Then returns the updated note with new content', async () => {
      // Create, then update
      const created = await createNote(baseUrl, { title: 'Original' });
      const res = await fetch(`${baseUrl}/api/notes/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Updated content' }),
      });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.content).toBe('Updated content');
      expect(body.title).toBe('Original');
    });
  });

  describe('When deleting a note via DELETE /api/notes/:id', () => {
    it('Then returns success and note is no longer retrievable', async () => {
      const created = await createNote(baseUrl, { title: 'To Delete' });
      const res = await fetch(`${baseUrl}/api/notes/${created.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);

      const get = await fetch(`${baseUrl}/api/notes/${created.id}`);
      expect(get.status).toBe(404);
    });
  });
});
```

**Files:**
- `examples/electrobun-notes/package.json` (with `"imports"` for `#generated`)
- `examples/electrobun-notes/tsconfig.json`
- `examples/electrobun-notes/vertz.config.ts`
- `examples/electrobun-notes/src/api/schema.ts`
- `examples/electrobun-notes/src/api/db.ts`
- `examples/electrobun-notes/src/api/entities/notes.entity.ts`
- `examples/electrobun-notes/src/api/server.ts`
- `examples/electrobun-notes/src/api/client.ts`
- `examples/electrobun-notes/src/__tests__/api.test.ts`

---

### Phase 2: Codegen + Type Safety Verification

**Goal:** Run codegen to generate typed client SDK. Verify types flow from schema to SDK with both positive and negative type tests. **Prove the schema-rename propagation — the crown-jewel validation of end-to-end type safety.**

**Acceptance Criteria:**
```typescript
describe('Given codegen has generated the client SDK', () => {
  describe('When importing the generated client', () => {
    it('Then api.notes.list() returns a descriptor', () => {
      const descriptor = api.notes.list();
      expect(descriptor).toBeDefined();
    });

    it('Then api.notes.create() accepts schema-shaped data', () => {
      const descriptor = api.notes.create({ title: 'Test' });
      expect(descriptor).toBeDefined();
    });
  });
});

// Type-level tests (.test-d.ts)
describe('Type: notes client SDK types', () => {
  it('rejects unknown fields on create', () => {
    // @ts-expect-error — 'foo' is not a valid field
    api.notes.create({ title: 'x', foo: 'bar' });
  });

  it('rejects wrong field types', () => {
    // @ts-expect-error — title must be string, not number
    api.notes.create({ title: 123 });
  });

  it('rejects non-existent fields on response', () => {
    const check = async () => {
      const res = await api.notes.list();
      if (res.ok) {
        // @ts-expect-error — 'completed' does not exist on Note
        const bad = res.data.items[0].completed;
      }
    };
  });

  it('response items have correct shape', () => {
    const check = async () => {
      const res = await api.notes.list();
      if (res.ok) {
        const t: string = res.data.items[0].title;
        const c: string = res.data.items[0].content;
      }
    };
  });
});
```

**Schema-rename propagation test (the definitive proof):**
1. Rename `title: d.text()` to `heading: d.text()` in `schema.ts`
2. Run `bun run codegen`
3. Run `bun run typecheck` — expect compile errors in:
   - `client.ts` (generated types reference `heading`, consumers reference `title`)
   - `note-form.tsx` (`noteForm.fields.title` no longer exists)
   - `notes-list.tsx` (`note.title` no longer exists)
   - Type-level tests (`api.notes.create({ title: ... })` is now wrong)
4. Revert the rename

This is scripted as a test in `src/__tests__/schema-rename-propagation.test.ts` that programmatically modifies the schema, runs codegen + typecheck, asserts on errors, and reverts.

**Files:**
- Run `bun run codegen` to generate `.vertz/generated/`
- `examples/electrobun-notes/src/__tests__/type-safety.test-d.ts`
- `examples/electrobun-notes/src/__tests__/schema-rename-propagation.test.ts`

---

### Phase 3: UI Components (notes list + create form)

**Goal:** Functional UI with notes list page and create form, demonstrating `query()` and `form()` consuming the typed SDK. Verify that types flow through the UI layer.

**Acceptance Criteria:**
```typescript
describe('Given the NotesListPage component', () => {
  describe('When rendered with mock data returning two notes', () => {
    it('Then renders an <ul> with two <li> elements', async () => {
      mockFetch([{ id: '1', title: 'Note A', content: 'aaa' }, { id: '2', title: 'Note B', content: 'bbb' }]);
      const { container } = renderTest(() => <NotesListPage />);
      await waitFor(() => {
        const items = container.querySelectorAll('.notes-list li');
        expect(items.length).toBe(2);
        expect(items[0].textContent).toContain('Note A');
        expect(items[1].textContent).toContain('Note B');
      });
    });
  });

  describe('When the query is loading', () => {
    it('Then renders "Loading notes..." text', () => {
      const { container } = renderTest(() => <NotesListPage />);
      expect(container.querySelector('.loading')?.textContent).toBe('Loading notes...');
    });
  });

  describe('When the query fails', () => {
    it('Then renders the error message', async () => {
      mockFetchError(new Error('Network failure'));
      const { container } = renderTest(() => <NotesListPage />);
      await waitFor(() => {
        expect(container.querySelector('.error')?.textContent).toContain('Network failure');
      });
    });
  });
});

describe('Given the NoteForm component', () => {
  describe('When submitting with a title and content', () => {
    it('Then calls api.notes.create and invokes onSuccess', async () => {
      const onSuccess = mock(() => {});
      mockFetch({ id: '1', title: 'New', content: 'Body' });
      const { container } = renderTest(() => <NoteForm onSuccess={onSuccess} />);

      const titleInput = container.querySelector('input[name="title"]') as HTMLInputElement;
      titleInput.value = 'New';
      container.querySelector('form')!.dispatchEvent(new Event('submit'));

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('When the form has progressive enhancement attributes', () => {
    it('Then the form has action and method attributes', () => {
      const { container } = renderTest(() => <NoteForm />);
      const formEl = container.querySelector('form');
      expect(formEl?.getAttribute('action')).toBeDefined();
      expect(formEl?.getAttribute('method')).toBe('POST');
    });
  });
});

// Type-level: verify query/form types flow through UI
describe('Type: UI layer type safety', () => {
  it('queryMatch data handler receives typed response', () => {
    // This compiles — proves types flow from SDK into queryMatch handler
    const notesQuery = query(api.notes.list());
    queryMatch(notesQuery, {
      data: (response) => {
        const title: string = response.items[0].title;
        // @ts-expect-error — 'nonexistent' does not exist on Note
        const bad = response.items[0].nonexistent;
      },
    });
  });
});
```

**Files:**
- `examples/electrobun-notes/src/app.tsx`
- `examples/electrobun-notes/src/pages/notes-list.tsx`
- `examples/electrobun-notes/src/components/note-form.tsx`
- `examples/electrobun-notes/src/components/note-item.tsx`
- `examples/electrobun-notes/src/entry-client.ts`
- `examples/electrobun-notes/src/styles/theme.ts`
- `examples/electrobun-notes/src/styles/components.ts`
- `examples/electrobun-notes/src/tests/note-form.test.ts`
- `examples/electrobun-notes/src/tests/notes-list.test.ts`

---

### Phase 4: Electrobun Desktop Shell

**Goal:** Wrap the Vertz app in an Electrobun BrowserWindow. The desktop app starts the Vertz server and opens the UI in a native window.

**Prerequisite spike:** Before writing any Electrobun code, validate workspace resolution:
1. Add `electrobun` to `package.json` dependencies
2. Run `bun install`
3. Verify `npx electrobun dev` can locate its binary
4. If it fails, create a standalone directory with `file:` references to local packages

**Acceptance Criteria (manual verification — Electrobun has no test harness):**
1. Run `electrobun dev` in `examples/electrobun-notes`
2. Confirm: a native window opens with title "Vertz Notes"
3. Confirm: the notes list UI renders inside the window
4. Confirm: creating a note via the form works and the list updates
5. Confirm: the Vertz API responds to `curl http://localhost:<port>/api/notes`

**Files:**
- `examples/electrobun-notes/electrobun.config.ts`
- `examples/electrobun-notes/src/bun/index.ts`
- `examples/electrobun-notes/src/index.html` (SPA entry page)
- Update `package.json` with Electrobun dependency and scripts

---

### Phase 5: Browser Dev Mode + Documentation

**Goal:** Create a browser-only dev server entry for running without Electrobun (for CI and quick iteration). Document the type safety story.

**Acceptance Criteria:**
```typescript
describe('Given the browser-only dev server', () => {
  describe('When running `bun run dev`', () => {
    it('Then the Vertz server starts and serves the SPA at localhost', async () => {
      const res = await fetch('http://localhost:3000');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('Then the API is accessible at /api/notes', async () => {
      const res = await fetch('http://localhost:3000/api/notes');
      expect(res.status).toBe(200);
    });
  });
});
```

- App runs in both modes: `electrobun dev` (desktop) and `bun run dev` (browser)

**Files:**
- `examples/electrobun-notes/src/dev-server.ts` (browser-only dev server)
- `examples/electrobun-notes/README.md`
- Update `package.json` scripts

## References

- [Electrobun Documentation](https://blackboard.sh/electrobun/docs/)
- [Electrobun BrowserWindow API](https://blackboard.sh/electrobun/docs/apis/browser-window/)
- `examples/entity-todo/` — Reference implementation for Vertz full-stack app
- `VISION.md` — "schema → database → API → client → UI"
- `MANIFESTO.md` — "types flow seamlessly from backend to frontend"
