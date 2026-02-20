# Vertz API Cheat Sheet

> Current state of package APIs — factual, not aspirational.

---

## @vertz/schema

**Version**: Internal package (monorepo)
**Location**: `packages/schema/src/index.ts`

### Key Exports

```typescript
// Factory object for schema creation
export const s: {
  // Primitives
  string(): StringSchema
  number(): NumberSchema
  boolean(): BooleanSchema
  int(): NumberSchema        // .int() applied
  date(): DateSchema
  
  // Composites  
  object<T>(shape: Record<string, SchemaAny>): ObjectSchema<T>
  array<T>(itemSchema: Schema<T>): ArraySchema<T>
  tuple<T>(items: [...T]): TupleSchema<T>
  union<T>(options: [...T]): UnionSchema<T>
  discriminatedUnion<T>(discriminator: string, options: [...T]): DiscriminatedUnionSchema<T>
  record<V>(valueSchema: Schema<V>): RecordSchema<V>
  map<K, V>(keySchema: Schema<K>, valueSchema: Schema<V>): MapSchema<K, V>
  set<V>(valueSchema: Schema<V>): SetSchema<V>
  
  // Special
  enum<T>(values: T): EnumSchema<T>
  literal<T>(value: T): LiteralSchema<T>
  lazy<T>(getter: () => Schema<T>): LazySchema<T>
  custom<T>(check: (v: unknown) => boolean, msg?: string): CustomSchema<T>
  
  // Formats
  email(): EmailSchema
  uuid(): UuidSchema
  url(): UrlSchema
  // ... more formats
  
  // Coercion
  coerce: { string, number, boolean, bigint, date }
}

// Result type
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
export const ok, err, unwrap, map, flatMap, match, matchErr
```

### Usage Example

```typescript
import { s, ok, err } from '@vertz/schema'

const UserSchema = s.object({
  id: s.string().uuid(),
  email: s.string().email(),
  name: s.string(),
  age: s.number().optional(),
})

const result = UserSchema.parse({ id: 'abc', email: 'test@test.com', name: 'Alice' })
// result: { ok: true, value: { id: 'abc', ... } }
```

### What's Missing for E2E

- Nothing critical. Schema is well-defined and works standalone.
- No built-in "schema → DB column" mapping (manual bridging via `s.fromDbEnum`)

---

## @vertz/db

**Version**: Internal package
**Location**: `packages/db/src/index.ts`, `packages/db/src/d.ts`

### Key Exports

```typescript
// Table builder
export const d: {
  uuid(): ColumnBuilder<string, DefaultMeta<'uuid'>>
  text(): ColumnBuilder<string, DefaultMeta<'text'>>
  varchar<TLength>(length: TLength): ColumnBuilder<string, VarcharMeta<TLength>>
  boolean(): ColumnBuilder<boolean, DefaultMeta<'boolean'>>
  integer(): ColumnBuilder<number, DefaultMeta<'integer'>>
  serial(): ColumnBuilder<number, SerialMeta>
  timestamp(): ColumnBuilder<Date, DefaultMeta<'timestamp with time zone'>>
  jsonb<T>(schemaOrOpts?): ColumnBuilder<T, DefaultMeta<'jsonb'>>
  enum<TName, TValues>(name: TName, values: TValues): ColumnBuilder<TValues[number], EnumMeta<TName, TValues>>
  tenant(targetTable): ColumnBuilder<string, TenantMeta>
  
  table<TColumns>(name: string, columns: TColumns, options?): TableDef<TColumns>
  index(columns: string | string[]): IndexDef
  
  ref: {
    one<TTarget>(target: () => TTarget, foreignKey: string): RelationDef
    many<TTarget>(target: () => TTarget, foreignKey?: string): ManyRelationDef
  }
  
  entry<TTable>(table: TTable, relations?): TableEntry<TTable, TRelations>
}

// CRUD queries
export const findOne, findMany, get, list, create, update, deleteOne, deleteMany, upsert, createMany

// Client
export function createDb(options: CreateDbOptions): DatabaseInstance
```

### Usage Example

```typescript
import { d } from '@vertz/db'

const users = d.table('users', {
  id: d.serial(),
  email: d.varchar(255),
  name: d.text(),
  createdAt: d.timestamp(),
})

const tasks = d.table('tasks', {
  id: d.serial(),
  userId: d.integer(),
  title: d.varchar(200),
  done: d.boolean(),
})

// Relations
const UserWithTasks = d.entry(users, {
  tasks: d.ref.many(() => tasks, 'userId'),
})
```

### What's Missing for E2E

- No built-in HTTP route integration (needs manual handler wiring)
- No query → schema validation built-in

---

## @vertz/server

**Version**: Internal package (wraps @vertz/core)
**Location**: `packages/server/src/index.ts`

### Key Exports

```typescript
// Server creation
export function createServer(config: AppConfig): AppBuilder

// Module system
export function createModule<TDeps, TBoot>(def: ModuleDef<TDeps, TBoot>): Module
export function createModuleDef<TDeps, TBoot>(config: ModuleDefConfig<TDeps, TBoot>): ModuleDef

// Middleware
export function createMiddleware(config: MiddlewareConfig): Middleware

// Exceptions
export class BadRequestException, NotFoundException, UnauthorizedException, ...

// Auth
export function createAuth(config: AuthConfig): AuthInstance
export function hashPassword, verifyPassword, validatePassword
export function createAccess(rules: AccessRules): AccessInstance

// Environment
export function createEnv<T>(schema: Schema<T>): EnvConfig<T>
```

### Usage Example

```typescript
import { createServer, createModule } from '@vertz/server'

const app = createServer({
  port: 3000,
})

app.module('db', async () => {
  const db = createDb({ connectionString: process.env.DATABASE_URL })
  return { db }
})

app.route('/api/users', {
  GET: async ({ db }, req) => {
    return findMany(db, 'users')
  },
})
```

### What's Missing for E2E

- No automatic route → DB query binding
- Auth is basic (no built-in session management in this version)
- Domain layer appears to be a stub (`domain.ts` is minimal)

---

## @vertz/ui

**Version**: Internal package
**Location**: `packages/ui/src/index.ts`

### Key Exports

```typescript
// Components
export function createContext<T>(defaultValue: T): Context<T>
export function useContext<T>(ctx: Context<T>): T

// Reactivity
export function signal<T>(initial: T): Signal<T>
export function computed<T>(fn: () => T): Computed<T>
export function effect(fn: () => void): void
export function untrack<T>(fn: () => T): T

// Lifecycle
export function onMount(fn: () => void): void
export function onCleanup(fn: () => void): void
export function watch<T>(signal: Signal<T>, fn: (value: T) => void): void

// Routing
export function defineRoutes(routes: RouteConfig): Router
export function createRouter(routes, initialPath): Router
export function createLink(currentPath, navigate): LinkFactory
export function createOutlet(ctx): OutletComponent

// Forms
export function form<T>(options: FormOptions<T>): FormInstance<T>
export function validate<T>(schema: Schema<T>, data: unknown): ValidationResult

// CSS/Theming
export function css(styles: CSSObject): { classNames, css: string }
export function defineTheme(theme: ThemeInput): CompiledTheme
export function ThemeProvider(props: ThemeProviderProps): HTMLElement
export function variants(config: VariantsConfig): VariantFunction

// Data fetching
export function query<T>(options: QueryOptions<T>): QueryResult<T>

// Hydration
export function hydrate(root: HTMLElement, strategy: Strategy): void
export const lazyStrategy, eagerStrategy, idleStrategy, interactionStrategy
```

### Usage Example

```typescript
import { signal, effect, css, defineRoutes, createRouter } from '@vertz/ui'

// Reactive state
const count = signal(0)
effect(() => console.log('Count:', count.value))
count.value++

// CSS
const styles = css({ padding: '1rem', background: 'blue' })
const el = <div class={styles.classNames.card}>Hello</div>

// Routes
const routes = defineRoutes({
  '/': { component: () => <HomePage />, loader: async () => fetchData() },
  '/tasks/:id': { component: () => <TaskPage /> },
})

const router = createRouter(routes, '/')
```

### What's Missing for E2E

- Query component doesn't auto-wire to server endpoints
- No built-in "loader receives DB result" integration

---

## @vertz/ui-server

**Version**: Internal package
**Location**: `packages/ui-server/src/index.ts`

### Key Exports

```typescript
// SSR rendering
export function renderPage(vnode: VNode, options?: PageOptions): Response
export function renderToStream(vnode: VNode, options?: RenderToStreamOptions): ReadableStream<Uint8Array>

// HTML utilities
export function serializeToHtml(vnode: VNode): string
export function renderHeadToHtml(entries: HeadEntry[]): string
export function wrapWithHydrationMarkers(html: string): string

// Dev server
export function createDevServer(options: DevServerOptions): DevServer
```

### Usage Example

```typescript
import { renderPage } from '@vertz/ui-server'
import { App } from './app'

export default {
  async fetch(request) {
    const url = new URL(request.url)
    
    if (url.pathname === '/') {
      return renderPage(<App />, {
        title: 'Task Manager',
        scripts: ['/app.js'],
      })
    }
    
    return new Response('Not Found', { status: 404 })
  },
}
```

### What's Missing for E2E

- No automatic route-to-handler wiring
- No built-in loader data serialization to HTML

---

## @vertz/errors

**Version**: Internal package
**Location**: `packages/errors/src/index.ts`

### Key Exports

```typescript
// Result type (re-exported in core)
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
export const ok, err, unwrap, isOk, isErr, map, flatMap, match

// AppError base class
export class AppError<Code extends string> {
  constructor(readonly code: Code, readonly message: string)
}

// Domain errors
export class NotFoundError extends AppError<'NOT_FOUND'>
export class ValidationError extends AppError<'VALIDATION'>
// ... more domain errors

// Infrastructure errors (thrown)
export class DbError extends Error
export class ConnectionError extends DbError
```

---

## @vertz/core

**Version**: Internal package (re-exported by @vertz/server)
**Location**: `packages/core/src/index.ts`

### Key Exports

See `@vertz/server` — this package is primarily re-exported there. Direct exports include:

- Server creation: `createServer`, `createApp` (deprecated)
- Exceptions: All HTTP exceptions
- Module system: `createModule`, `createModuleDef`
- Middleware: `createMiddleware`
- Result type: `ok`, `err`, `Result`

---

## E2E Gap Analysis

### What's Needed to Wire Schema → DB → Server → UI

| Layer | Current State | Gap |
|-------|---------------|-----|
| **Schema → DB** | Manual via `s.fromDbEnum()` for enums only | No automatic schema-to-column mapping. Must define `d.table()` separately from `s.object()`. |
| **DB → Server** | `createDb()` returns instance; handlers manually call `findMany(db, 'table')` | No automatic route generation from DB tables. Manual CRUD handlers required. |
| **Server → UI** | Loaders are async functions you write; `query()` is client-side | No code generation from server endpoints. Manual fetch/loader wiring. |
| **UI → SSR** | `renderPage(<App />)` works, but loader data not automatically serialized | Loader return values must be manually injected into HTML (no `useLoaderData()` equivalent). |

### Missing Pieces for a Working E2E Example

1. **DB Schema + Validation Bridge** — Currently two definitions:
   ```typescript
   // schema.ts
   const UserSchema = s.object({ ... })
   
   // db.ts  
   const users = d.table('users', { ... })  // duplicate
   ```
   Need: Single source of truth or codegen to sync them.

2. **Route Handler Generation** — Currently:
   ```typescript
   app.route('/users', {
     GET: async () => findMany(db, 'users'),
     POST: async (req) => create(db, 'users', req.body),
   })
   ```
   Need: Auto-generate handlers from DB table definitions.

3. **Loader Serialization** — Currently:
   ```typescript
   // router.ts
   loader: async () => { const data = await fetch('/api/users'); return data }
   
   // SSR manually: renderPage(<App />) — no loader data passed!
   ```
   Need: `renderPage` must receive loader data and serialize to `window.__LOADER_DATA__`.

4. **Client Hydration** — Currently:
   - `hydrate()` exists but requires manual root element selection
   - No zero-config hydration from SSR HTML

### Quick Win: Minimal E2E Example

To demonstrate end-to-end with current APIs:

1. **Define DB**: `const users = d.table('users', { ... })` in `db.ts`
2. **Create server**: `createServer({ ... }).route('/users', { GET: ... })`
3. **Define UI route**: `defineRoutes({ '/': { loader: fetchUsers, component: Page } })`
4. **SSR**: `renderPage(<App />, { title: 'Users' })` — manually inject loader data via script tag
5. **Hydrate**: Call `hydrate(document.getElementById('app'))` on client

The gaps are integration/codegen, not core primitives.
