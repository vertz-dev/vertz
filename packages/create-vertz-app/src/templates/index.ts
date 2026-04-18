// ── LLM rules templates ───────────────────────────────────

/**
 * CLAUDE.md — project-level instructions for LLMs
 */
export function claudeMdTemplate(projectName: string): string {
  return `# ${projectName}

A full-stack TypeScript application built with [Vertz](https://vertz.dev).

## Stack

- Runtime: Vertz (vtz)
- Framework: Vertz (full-stack TypeScript)
- Language: TypeScript (strict mode)
- Docs: https://docs.vertz.dev

## Development

\`\`\`bash
vtz install          # Install dependencies
vtz dev              # Start dev server with HMR
vtz build            # Production build
\`\`\`

The dev server automatically runs codegen and migrations when files change.

## Dev Server Tools

The dev server exposes built-in MCP tools and HTTP endpoints for AI agents.
See \`.claude/rules/dev-server-tools.md\` for the full list.

**Key rule:** Always call \`vertz_get_errors\` after code changes before reporting success.

## Conventions

- See \`.claude/rules/\` for API and UI development conventions
- Refer to https://docs.vertz.dev for full framework documentation
- Entity files use the \`.entity.ts\` suffix
- The Vertz compiler handles all reactivity — never use \`.value\`, \`signal()\`, or \`computed()\` manually

## Auto-Generated SDK

Vertz auto-generates a fully typed SDK at \`.vertz/generated/\` from your entity and service definitions.
The SDK is re-exported from \`src/client.ts\` as \`api\`. Use it for ALL data fetching and mutations.

**NEVER use raw \`fetch()\` for API calls.** Always use the generated SDK methods with \`query()\` and \`form()\`:

\`\`\`ts
import { api } from './client';   // auto-generated typed SDK
import { query, form } from 'vertz/ui';

const tasks = query(api.tasks.list());          // entity CRUD
const contactForm = form(api.support.send);     // service action
\`\`\`

Raw \`fetch()\` bypasses type safety, SSR integration, caching, and optimistic updates.
The SDK runs codegen automatically during \`vtz dev\` and \`vtz build\`.

## Common Mistakes

- **DON'T** use \`signal()\`, \`.value\`, or \`computed()\` manually — use \`let\` for state, \`const\` for derived values. The compiler handles reactivity.
- **DON'T** use \`() => true\` for entity access rules — use \`rules.public\` from \`vertz/server\`. Descriptors are serializable and inspectable; callbacks are opaque.
- **DON'T** use raw \`fetch()\` — use the generated SDK via \`api.*\` from \`src/client.ts\`.
- **DON'T** override generated SDK methods with manual fetch wrappers — if codegen doesn't expose something, report it as a framework gap.
- **DON'T** call components as functions — always use JSX: \`<TaskCard task={t} />\`, not \`TaskCard({ task: t })\`.
- **DON'T** use \`.references()\` on columns for foreign keys — use \`d.ref.one()\` on models instead.

## Configuration (vertz.config.ts)

The runtime auto-detects entry files by convention:
- \`src/entry-client.ts\` — client hydration entry
- \`src/app.tsx\` — SSR entry
- \`src/api/server.ts\` — API server entry

Valid compiler fields: \`sourceDir\`, \`outputDir\`, \`schemas\`, \`openapi\`, \`validation\`.
Do NOT add \`entryFile\` — it is not a valid config option.
`;
}

/**
 * .claude/rules/api-development.md — API conventions for LLMs
 */
export function apiDevelopmentRuleTemplate(): string {
  return `# API Development

## Imports

All Vertz packages are available through the \`vertz\` meta-package:

\`\`\`ts
import { createServer, entity, createEnv } from 'vertz/server';
import { s } from 'vertz/schema';
import { d } from 'vertz/db';
\`\`\`

## Defining Tables and Models

Use \`d.table()\` to define database tables and \`d.model()\` to create a typed model:

\`\`\`ts
import { d } from 'vertz/db';

export const postsTable = d.table('posts', {
  id: d.uuid().primary(),
  title: d.text(),
  body: d.text(),
  published: d.boolean().default(false),
  authorId: d.uuid(),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

export const postsModel = d.model(postsTable);
\`\`\`

### Field Types

- \`d.uuid()\` — UUID field
- \`d.text()\` — Text/string field
- \`d.boolean()\` — Boolean field
- \`d.integer()\` — Integer field
- \`d.timestamp()\` — Timestamp field

### Field Modifiers

- \`.primary()\` — Primary key
- \`.default(value)\` — Default value (\`'now'\` for timestamps)
- \`.readOnly()\` — Not writable via API
- \`.autoUpdate()\` — Auto-set on update (timestamps)
- \`.unique()\` — Unique constraint

## Defining Entities

Entities define your API resources. Each entity gets automatic CRUD endpoints.
Entity files go in \`src/api/entities/\` with the \`.entity.ts\` suffix.

\`\`\`ts
import { entity, rules } from 'vertz/server';
import { postsModel } from '../schema';

export const posts = entity('posts', {
  model: postsModel,
  access: {
    list: rules.public,
    get: rules.public,
    create: rules.public,
    update: rules.public,
    delete: rules.public,
  },
});
\`\`\`

### Access Rules

Use \`rules.*\` descriptors from \`vertz/server\` — never callback functions.

| Rule | Description |
| ---- | ----------- |
| \`rules.public\` | No authentication required |
| \`rules.authenticated()\` | User must be logged in |
| \`rules.entitlement('name')\` | User has this entitlement |
| \`rules.where({ field: rules.user.id })\` | Row-level condition |
| \`rules.all(r1, r2)\` | All rules must pass (AND) |
| \`rules.any(r1, r2)\` | Any rule must pass (OR) |

Operations without access rules don't generate routes (deny-by-default).
Always use descriptors — never callback functions. Descriptors are serializable and inspectable; callbacks are opaque.

### Entity Operations

Each entity automatically provides these operations:

| Operation | HTTP                    | Description                    |
| --------- | ----------------------- | ------------------------------ |
| \`list\`    | GET /api/<entity>       | List with filtering/pagination |
| \`get\`     | GET /api/<entity>/:id   | Get by ID                      |
| \`create\`  | POST /api/<entity>      | Create new record              |
| \`update\`  | PATCH /api/<entity>/:id | Update existing record         |
| \`delete\`  | DELETE /api/<entity>/:id| Delete record                  |

## Auto-Generated SDK

Entities and services automatically generate a typed SDK at \`.vertz/generated/\`.
The SDK is consumed in the UI via \`src/client.ts\`:

\`\`\`ts
import { api } from '../client';

// Entity CRUD — auto-generated from entity('posts', ...)
api.posts.list();
api.posts.get(id);
api.posts.create({ title: 'Hello' });
api.posts.update(id, { title: 'Updated' });
api.posts.delete(id);

// Service actions — auto-generated from service('notifications', ...)
api.notifications.sendEmail({ to, subject, body });
\`\`\`

The SDK provides full type safety, SSR integration, caching, and optimistic updates.
**NEVER use raw \`fetch()\` in UI code — always use the SDK.**

## Server Configuration

Register all entities with \`createServer\`:

\`\`\`ts
import { createServer } from 'vertz/server';
import { db } from './db';
import { env } from './env';
import { posts } from './entities/posts.entity';

const app = createServer({
  basePath: '/api',
  entities: [posts],
  db,
});

export default app;

if (import.meta.main) {
  app.listen(env.PORT).then((handle) => {
    console.log(\\\`Server running at http://localhost:\\\${handle.port}/api\\\`);
  });
}
\`\`\`

## Environment Variables

Use \`createEnv\` for validated, typed environment variables:

\`\`\`ts
import { createEnv } from 'vertz/server';
import { s } from 'vertz/schema';

export const env = createEnv({
  schema: s.object({
    PORT: s.coerce.number().default(3000),
    DATABASE_URL: s.string().default('local.db'),
  }),
});
\`\`\`

## Schemas for Custom Actions

Standard CRUD operations (list, get, create, update, delete) derive their schemas automatically
from the model — you don't need to define schemas for them.

Use \`s.*\` builders only when defining **custom actions** on entities:

\`\`\`ts
import { s } from 'vertz/schema';

const CompleteTaskInput = s.object({
  note: s.string().optional(),
  completedAt: s.date(),
});

type CompleteTaskInput = s.infer<typeof CompleteTaskInput>;
\`\`\`

### Common Schema Types

- \`s.string()\` — String with \`.min()\`, \`.max()\`, \`.email()\`, \`.uuid()\`, \`.url()\`
- \`s.number()\` — Number with \`.int()\`, \`.min()\`, \`.max()\`, \`.positive()\`
- \`s.boolean()\` — Boolean
- \`s.date()\` — Date
- \`s.enum([...])\` — Enum from literal values
- \`s.array(schema)\` — Array of schema type
- \`s.object({...})\` — Object with typed fields
- \`.optional()\` — Makes any field optional
- \`.default(value)\` — Provides a default value
`;
}

/**
 * .claude/rules/ui-development.md — UI conventions for LLMs
 */
export function uiDevelopmentRuleTemplate(): string {
  return `# UI Development

Vertz uses a custom JSX runtime with a compiler that transforms reactive code.
You write plain-looking code and the compiler makes it reactive automatically.

## Imports

\`\`\`ts
import { css, query, globalCss, ThemeProvider, variants } from 'vertz/ui';
import { api } from '../client';
\`\`\`

## IMPORTANT: Always Use the Generated SDK

The \`api\` import from \`'../client'\` is a typed SDK auto-generated from your entity and service definitions.
It provides typed methods for every entity CRUD operation and service action.

**NEVER use raw \`fetch()\` for API calls.** Raw fetch bypasses:
- Type safety (request/response types)
- SSR data loading (causes loading flash)
- Automatic cache invalidation
- Optimistic updates

\`\`\`tsx
// WRONG — raw fetch
const res = await fetch('/api/tasks');
const tasks = await res.json();

// RIGHT — use the auto-generated SDK
const tasks = query(api.tasks.list());
\`\`\`

## Components

### Destructure props in parameters

Don't annotate return types — the JSX factory handles typing:

\`\`\`tsx
// RIGHT
export function TaskCard({ task, onClick }: TaskCardProps) {
  return <div onClick={onClick}>{task.title}</div>;
}

// WRONG — don't annotate return type
export function TaskCard({ task }: TaskCardProps): HTMLElement { ... }
\`\`\`

### Props Naming

- Interface: \`ComponentNameProps\`
- Callbacks: \`on\` prefix (\`onClick\`, \`onSubmit\`, \`onSuccess\`)

## Reactivity

The Vertz compiler transforms your code to be reactive. You don't call signal/computed APIs manually.

### \`let\` for local state (compiled to signals)

\`\`\`tsx
export function Counter() {
  let count = 0;

  return (
    <button onClick={() => { count++; }}>
      Count: {count}
    </button>
  );
}
\`\`\`

### \`const\` for derived values (compiled to computed)

\`\`\`tsx
export function TaskList() {
  let filter = 'all';
  const tasks = query(api.tasks.list());
  const filtered = filter === 'all'
    ? tasks.data.items
    : tasks.data.items.filter((t) => t.status === filter);

  return <div>{filtered.map((t) => <TaskItem task={t} />)}</div>;
}
\`\`\`

## JSX

### Fully declarative — no imperative DOM manipulation

Never use \`appendChild\`, \`innerHTML\`, \`textContent\`, \`document.createElement\`.

\`\`\`tsx
// RIGHT
return <div className={styles.panel}>{title}</div>;

// WRONG — no imperative DOM
const el = document.createElement('div');
el.textContent = title;
\`\`\`

### Use JSX for custom components, not function calls

\`\`\`tsx
// RIGHT
<TaskCard task={task} onClick={handleClick} />

// WRONG
TaskCard({ task, onClick: handleClick });
\`\`\`

### Conditionals and Lists

\`\`\`tsx
{isLoading && <div>Loading...</div>}

{error ? <div className={styles.error}>{error.message}</div> : <div>{content}</div>}

{tasks.map((task) => (
  <TaskItem key={task.id} task={task} />
))}
\`\`\`

## Data Fetching

### \`query()\` — Reactive data fetching

\`\`\`tsx
const tasks = query(api.tasks.list());
\`\`\`

The query result has reactive properties (\`.data\`, \`.error\`, \`.loading\`) that the compiler
auto-unwraps everywhere — just access them directly, the compiler handles the rest.

### Rendering query states

Use direct conditional rendering for loading, error, and data states:

\`\`\`tsx
{tasks.loading && <div>Loading...</div>}
{tasks.error && <div>Error: {tasks.error.message}</div>}
{tasks.data && (
  <div>
    {tasks.data.items.map((item) => (
      <div key={item.id}>{item.title}</div>
    ))}
  </div>
)}
\`\`\`

### Automatic Cache Invalidation

After mutations (\`create\`, \`update\`, \`delete\`), related queries are automatically
refetched in the background. No manual \`refetch()\` calls needed — the framework
handles cache invalidation via optimistic updates.

## Theme Components — Prefer Over Raw HTML

When a themed component exists, use it instead of raw HTML elements with manual class names.
Theme components are pre-configured with the app's design tokens and provide consistent styling.

### Using Components

Import components from \`@vertz/ui/components\` — the centralized entrypoint:

\`\`\`tsx
import { Button, Input, Dialog } from '@vertz/ui/components';

// RIGHT — use theme components
<Button intent="primary" size="md">Submit</Button>
<Input placeholder="Enter text" />

// WRONG — raw HTML with manual styles
<button className={button({ intent: 'primary', size: 'md' })}>Submit</button>
<input className={inputStyles.base} placeholder="Enter text" />
\`\`\`

### Available Components

**Direct**: \`Button\`, \`Input\`, \`Label\`, \`Badge\`, \`Textarea\`,
\`Card\` suite, \`Table\` suite, \`Avatar\` suite, \`FormGroup\` suite

**Primitives**: \`Dialog\`, \`Tabs\`,
\`Select\`, \`DropdownMenu\`, \`Popover\`, \`Sheet\`, \`Tooltip\`, \`Accordion\`
— all with sub-components (\`.Title\`, \`.Content\`, \`.Footer\`, etc.)

## Dialogs

### \`useDialogStack()\` for all dialogs

All dialogs use the DialogStack pattern — imperative, promise-based, with automatic
overlay, focus trapping, and stacking via native \`<dialog>\`.

\`\`\`tsx
import { useDialogStack } from '@vertz/ui';

const dialogs = useDialogStack();

// Quick confirmation
const confirmed = await dialogs.confirm({
  title: 'Delete task?',
  description: 'This action cannot be undone.',
  confirm: 'Delete',
  cancel: 'Cancel',
  intent: 'danger',
});
if (confirmed) handleDelete();
\`\`\`

### Custom dialog components

\`\`\`tsx
import { useDialogStack, useDialog } from '@vertz/ui';
import { Dialog } from '@vertz/ui/components';

function EditDialog({ task, dialog }: { task: Task; dialog: DialogHandle<Task> }) {
  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Edit Task</Dialog.Title>
      </Dialog.Header>
      <Dialog.Body>...</Dialog.Body>
      <Dialog.Footer>
        <Dialog.Cancel>Cancel</Dialog.Cancel>
        <Button onClick={() => dialog.close(updatedTask)}>Save</Button>
      </Dialog.Footer>
    </>
  );
}

// Open it
const result = await dialogs.open(EditDialog, { task });
if (result.ok) saveTask(result.data);
\`\`\`

## Styling

### \`css()\` for layout and custom styles

Use \`css()\` for layout-specific styles that don't correspond to a theme component:

\`\`\`tsx
const styles = css({
  container: { display: 'flex', flexDirection: 'column', gap: token.spacing[4], padding: token.spacing[6] },
  heading: { fontSize: token.font.size.xl, fontWeight: token.font.weight.bold, color: token.color.foreground },
});

return <div className={styles.container}>...</div>;
\`\`\`

### Style Tokens

Styles use plain CSS properties combined with design tokens via the \`token\` helper:

\`\`\`ts
import { css, token } from 'vertz/ui';

const styles = css({
  card: {
    padding: token.spacing[4],
    backgroundColor: token.color.background,
    color: token.color.foreground,
    borderRadius: token.radius.md,
    fontSize: token.font.size.sm,
    fontWeight: token.font.weight.medium,
  },
});
\`\`\`

Common token paths: \`token.spacing[n]\`, \`token.color.<namespace>[.shade]\`, \`token.font.size.<size>\`, \`token.font.weight.<weight>\`, \`token.radius.<size>\`, \`token.shadow.<size>\`.

## Context

\`\`\`tsx
import { createContext, useContext } from 'vertz/ui';

export const SettingsContext = createContext<SettingsValue>();

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be called within SettingsContext.Provider');
  return ctx;
}
\`\`\`

## Router

### Navigation

Pages access the router via hooks — no prop threading:

\`\`\`tsx
import { useRouter, useParams } from 'vertz/ui';

export function TaskListPage() {
  const { navigate } = useRouter();
  return <button onClick={() => navigate({ to: '/tasks/new' })}>New Task</button>;
}

export function TaskDetailPage() {
  const { id } = useParams<'/tasks/:id'>();
  // id is typed as string
}
\`\`\`
`;
}

// ── Static asset templates ─────────────────────────────────

/**
 * public/favicon.svg — Vertz logo on dark background
 */
export function faviconTemplate(): string {
  return `<svg width="32" height="32" viewBox="0 0 298 298" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="298" height="298" rx="60" fill="#0a0a0b"/><path d="M120.277 77H26L106.5 185.5L151.365 124.67L120.277 77Z" fill="white"/><path d="M147.986 243L125.5 210.5L190.467 124.67L160.731 77H272L147.986 243Z" fill="white"/></svg>
`;
}

// ── Config file templates ──────────────────────────────────

/**
 * Package.json template — full-stack deps + #generated imports map
 */
export function packageJsonTemplate(projectName: string): string {
  const pkg = {
    name: projectName,
    version: '0.1.0',
    type: 'module',
    license: 'MIT',
    scripts: {
      dev: 'vertz dev',
      build: 'vertz build',
      start: 'vertz start',
      test: 'vertz test',
      codegen: 'vertz codegen',
    },
    imports: {
      '#generated': './.vertz/generated/client.ts',
      '#generated/types': './.vertz/generated/types/index.ts',
    },
    dependencies: {
      vertz: '^0.2.0',
      '@vertz/theme-shadcn': '^0.2.0',
    },
    devDependencies: {
      '@vertz/cli': '^0.2.0',
      '@vertz/test': '^0.2.0',
      typescript: '^5.8.0',
    },
  };

  return JSON.stringify(pkg, null, 2);
}

/**
 * Tsconfig.json template — JSX config for @vertz/ui
 */
export function tsconfigTemplate(): string {
  const tsconfig = {
    compilerOptions: {
      declaration: true,
      esModuleInterop: true,
      jsx: 'react-jsx',
      jsxImportSource: '@vertz/ui',
      module: 'ESNext',
      moduleResolution: 'bundler',
      outDir: 'dist',
      rootDir: '.',
      skipLibCheck: true,
      strict: true,
      target: 'ES2022',
      types: ['vertz/env'],
    },
    include: ['src', '.vertz/generated'],
  };

  return JSON.stringify(tsconfig, null, 2);
}

/**
 * vertz.config.ts template — codegen config
 */
export function vertzConfigTemplate(): string {
  return `/** @type {import('@vertz/compiler').VertzConfig} */
export default {};

/** @type {import('@vertz/codegen').CodegenConfig} */
export const codegen = {
  generators: ['typescript'],
};
`;
}

/**
 * .env template
 */
export function envTemplate(): string {
  return `PORT=3000
DATABASE_URL=local.db
`;
}

/**
 * .env.example template
 */
export function envExampleTemplate(): string {
  return `PORT=3000
DATABASE_URL=local.db
`;
}

/**
 * .gitignore template
 */
export function gitignoreTemplate(): string {
  return `# Dependencies
node_modules/

# Build outputs
dist/
.vertz/

# Environment
.env
.env.local
.env.*.local

# Database
*.db

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`;
}

// ── Source file templates ───────────────────────────────────

/**
 * src/api/env.ts — validated environment variables
 */
export function envModuleTemplate(): string {
  return `import { createEnv } from 'vertz/server';
import { s } from 'vertz/schema';

export const env = createEnv({
  schema: s.object({
    PORT: s.coerce.number().default(3000),
    DATABASE_URL: s.string().default('local.db'),
  }),
});
`;
}

/**
 * src/api/server.ts — createServer with entities + db
 */
export function serverTemplate(): string {
  return `import { createServer } from 'vertz/server';
import { db } from './db';
import { env } from './env';
import { tasks } from './entities/tasks.entity';

const app = createServer({
  basePath: '/api',
  entities: [tasks],
  db,
});

export default app;

if (import.meta.main) {
  app.listen(env.PORT).then((handle) => {
    console.log(\`Server running at http://localhost:\${handle.port}/api\`);
  });
}
`;
}

/**
 * src/api/schema.ts — tasks table + model
 */
export function schemaTemplate(): string {
  return `import { d } from 'vertz/db';

export const tasksTable = d.table('tasks', {
  id: d.uuid().primary(),
  title: d.text().min(1),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

export const tasksModel = d.model(tasksTable);
`;
}

/**
 * src/api/db.ts — createDb with local SQLite and autoApply migrations
 */
export function dbTemplate(): string {
  return `import { createDb } from 'vertz/db';
import { tasksModel } from './schema';

export const db = createDb({
  models: { tasks: tasksModel },
  dialect: 'sqlite',
  path: '.vertz/data/app.db',
  migrations: { autoApply: true },
});
`;
}

/**
 * src/api/entities/tasks.entity.ts — entity with CRUD access
 */
export function tasksEntityTemplate(): string {
  return `import { entity, rules } from 'vertz/server';
import { tasksModel } from '../schema';

export const tasks = entity('tasks', {
  model: tasksModel,
  access: {
    list: rules.public,
    get: rules.public,
    create: rules.public,
    update: rules.public,
    delete: rules.public,
  },
});
`;
}

/**
 * src/client.ts — #generated imports + type re-export
 */
export function clientTemplate(): string {
  return `import { createClient } from '#generated';

export type * from '#generated/types';

export const api = createClient();
`;
}

/**
 * src/app.tsx — SSR module exports + ThemeProvider + render HomePage
 */
export function appComponentTemplate(): string {
  return `import { DialogStackProvider, ThemeProvider, css, getInjectedCSS, globalCss, token } from 'vertz/ui';
import { HomePage } from './pages/home';
import { appTheme, themeGlobals } from './styles/theme';

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

const styles = css({
  shell: { minHeight: '100vh', backgroundColor: token.color.background, color: token.color.foreground },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: token.spacing[6], paddingBlock: token.spacing[4], borderBottomWidth: '1px', borderColor: token.color.border },
  title: { fontSize: token.font.size.lg, fontWeight: token.font.weight.bold, color: token.color.foreground },
  main: { maxWidth: '42rem', marginInline: 'auto', paddingInline: token.spacing[6], paddingBlock: token.spacing[8] },
});

export { getInjectedCSS };
export const theme = appTheme;
export const globalStyles = [themeGlobals.css, appGlobals.css];

export function App() {
  return (
    <div data-testid="app-root">
      <ThemeProvider theme="light">
        <DialogStackProvider>
          <div className={styles.shell}>
            <header className={styles.header}>
              <div className={styles.title}>My Vertz App</div>
            </header>
            <main className={styles.main}>
              <HomePage />
            </main>
          </div>
        </DialogStackProvider>
      </ThemeProvider>
    </div>
  );
}
`;
}

/**
 * src/entry-client.ts — mount + HMR self-accept
 */
export function entryClientTemplate(): string {
  return `import { mount } from 'vertz/ui';
import { App, globalStyles, theme } from './app';

import.meta.hot.accept();

mount(App, {
  theme,
  styles: globalStyles,
});
`;
}

/**
 * src/styles/theme.ts — configureTheme from @vertz/theme-shadcn
 */
export function themeTemplate(): string {
  return `import { configureTheme } from '@vertz/theme-shadcn';
import { registerTheme } from 'vertz/ui';

const config = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

registerTheme(config);

export const appTheme = config.theme;
export const themeGlobals = config.globals;
`;
}

/**
 * src/pages/home.tsx — full CRUD task list with form, checkbox toggle,
 * delete confirmation dialog, and animated list transitions.
 * Demonstrates theme components (Button, Input) and DialogStack confirmation.
 */
export function homePageTemplate(): string {
  return `import {
  ANIMATION_DURATION,
  ANIMATION_EASING,
  css,
  fadeOut,
  form,
  globalCss,
  query,
  slideInFromTop,
  token,
  useDialogStack,
} from 'vertz/ui';
import { Button, List } from '@vertz/ui/components';
import { api } from '../client';

// Global CSS for list item enter/exit animations
void globalCss({
  '[data-presence="enter"]': {
    animation: \`\${slideInFromTop} \${ANIMATION_DURATION} \${ANIMATION_EASING}\`,
  },
  '[data-presence="exit"]': {
    animation: \`\${fadeOut} \${ANIMATION_DURATION} \${ANIMATION_EASING}\`,
    overflow: 'hidden',
  },
});

const styles = css({
  container: { paddingBlock: token.spacing[2], width: '100%' },
  heading: { fontSize: token.font.size.xl, fontWeight: token.font.weight.bold, color: token.color.foreground, marginBottom: token.spacing[4] },
  form: { display: 'flex', alignItems: 'flex-start', gap: token.spacing[2], marginBottom: token.spacing[6] },
  inputWrap: { flex: '1 1 0%' },
  input: { width: '100%', height: token.spacing[10], paddingInline: token.spacing[3], borderRadius: token.radius.md, borderWidth: '1px', borderColor: token.color.border, backgroundColor: token.color.background, color: token.color.foreground, fontSize: token.font.size.sm },
  fieldError: { color: token.color.destructive, fontSize: token.font.size.xs, marginTop: token.spacing[1] },
  list: { display: 'flex', flexDirection: 'column', gap: token.spacing[2] },
  item: { display: 'flex', width: '100%', alignItems: 'center', gap: token.spacing[3], paddingInline: token.spacing[4], paddingBlock: token.spacing[3], borderRadius: token.radius.md, borderWidth: '1px', borderColor: token.color.border, backgroundColor: token.color.card, transition: 'colors', '&:hover': { backgroundColor: token.color.accent } },
  checkbox: { width: token.spacing[4], height: token.spacing[4], cursor: 'pointer', borderRadius: token.radius.sm },
  label: { flex: '1 1 0%', fontSize: token.font.size.sm, color: token.color.foreground },
  labelDone: { flex: '1 1 0%', fontSize: token.font.size.sm, color: token.color['muted-foreground'], textDecoration: 'line-through' },
  loading: { color: token.color['muted-foreground'] },
  error: { color: token.color.destructive },
  empty: { color: token.color['muted-foreground'], textAlign: 'center', paddingBlock: token.spacing[8] },
  count: { fontSize: token.font.size.xs, color: token.color['muted-foreground'], marginTop: token.spacing[4] },
});

interface TaskItemProps {
  id: string;
  title: string;
  completed: boolean;
}

function TaskItem({ id, title, completed }: TaskItemProps) {
  const dialogs = useDialogStack();

  const handleToggle = async () => {
    await api.tasks.update(id, { completed: !completed });
  };

  const handleDelete = async () => {
    const confirmed = await dialogs.confirm({
      title: 'Delete task?',
      description: 'This action cannot be undone.',
      confirm: 'Delete',
      cancel: 'Cancel',
      intent: 'danger',
    });
    if (confirmed) {
      await api.tasks.delete(id);
    }
  };

  return (
    <div className={styles.item}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={completed}
        onChange={handleToggle}
      />
      <span className={completed ? styles.labelDone : styles.label}>
        {title}
      </span>
      <Button intent="ghost" size="sm" onClick={handleDelete}>Delete</Button>
    </div>
  );
}

export function HomePage() {
  const tasksQuery = query(api.tasks.list());

  const taskForm = form(api.tasks.create, {
    resetOnSuccess: true,
  });

  return (
    <div className={styles.container} data-testid="home-page">
      <h1 className={styles.heading}>Tasks</h1>

      <form
        className={styles.form}
        action={taskForm.action}
        method={taskForm.method}
        onSubmit={taskForm.onSubmit}
      >
        <div className={styles.inputWrap}>
          <input
            name={taskForm.fields.title}
            className={styles.input}
            placeholder="What needs to be done?"
          />
          <span className={styles.fieldError}>
            {taskForm.title.error}
          </span>
        </div>
        <Button type="submit" disabled={taskForm.submitting}>
          {taskForm.submitting.value ? 'Adding...' : 'Add'}
        </Button>
      </form>

      {tasksQuery.loading && (
        <div className={styles.loading}>Loading tasks...</div>
      )}
      {tasksQuery.error && (
        <div className={styles.error}>
          {tasksQuery.error instanceof Error ? tasksQuery.error.message : String(tasksQuery.error)}
        </div>
      )}
      {tasksQuery.data && (
        <>
          {tasksQuery.data.items.length === 0 && (
            <div className={styles.empty}>
              No tasks yet. Add one above!
            </div>
          )}
          <div data-testid="task-list" className={styles.list}>
            <List animate>
              {tasksQuery.data.items.map((task) => (
                <List.Item key={task.id}>
                  <TaskItem
                    id={task.id}
                    title={task.title}
                    completed={task.completed}
                  />
                </List.Item>
              ))}
            </List>
          </div>
          {tasksQuery.data.items.length > 0 && (
            <div className={styles.count}>
              {tasksQuery.data.items.filter((t) => !t.completed).length} remaining
            </div>
          )}
        </>
      )}
    </div>
  );
}
`;
}

// ── Hello World template functions ────────────────────────

/**
 * CLAUDE.md for hello-world template — UI-only project description
 */
export function helloWorldClaudeMdTemplate(projectName: string): string {
  return `# ${projectName}

A UI-only TypeScript application built with [Vertz](https://vertz.dev).

## Stack

- Runtime: Vertz (vtz)
- Framework: Vertz (UI)
- Language: TypeScript (strict mode)
- Docs: https://docs.vertz.dev

## Development

\`\`\`bash
vtz install          # Install dependencies
vtz dev              # Start dev server with HMR
vtz build            # Production build
\`\`\`

## Dev Server Tools

The dev server exposes built-in MCP tools and HTTP endpoints for AI agents.
See \`.claude/rules/dev-server-tools.md\` for the full list.

**Key rule:** Always call \`vertz_get_errors\` after code changes before reporting success.

## Adding a Backend

To add API and database support, see https://docs.vertz.dev/guides/server/overview

## Routing

Routes are defined in \`src/router.tsx\` using \`defineRoutes\` and \`createRouter\`.
To add a new page, create a component in \`src/pages/\` and add a route entry in \`src/router.tsx\`.

## Conventions

- See \`.claude/rules/\` for UI development conventions
- Refer to https://docs.vertz.dev for full framework documentation
- The Vertz compiler handles all reactivity — never use \`.value\`, \`signal()\`, or \`computed()\` manually

## Common Mistakes

- **DON'T** use \`signal()\`, \`.value\`, or \`computed()\` manually — use \`let\` for state, \`const\` for derived values. The compiler handles reactivity.
- **DON'T** call components as functions — always use JSX: \`<Counter />\`, not \`Counter()\`.
- **DON'T** annotate component return types — let TypeScript infer from JSX.
`;
}

/**
 * Package.json for hello-world — no API deps, no #generated imports, no codegen
 */
export function helloWorldPackageJsonTemplate(projectName: string): string {
  const pkg = {
    name: projectName,
    version: '0.1.0',
    type: 'module',
    license: 'MIT',
    scripts: {
      dev: 'vertz dev',
      build: 'vertz build',
      test: 'vertz test',
    },
    dependencies: {
      vertz: '^0.2.0',
      '@vertz/theme-shadcn': '^0.2.0',
    },
    devDependencies: {
      '@vertz/cli': '^0.2.0',
      '@vertz/test': '^0.2.0',
      typescript: '^5.8.0',
    },
  };

  return JSON.stringify(pkg, null, 2);
}

/**
 * vertz.config.ts for hello-world — minimal, no server entry
 */
export function helloWorldVertzConfigTemplate(): string {
  return `/** @type {import('@vertz/compiler').VertzConfig} */
export default {};
`;
}

/**
 * src/app.tsx for hello-world — App with RouterContext.Provider, RouterView, and NavBar
 */
export function helloWorldAppTemplate(): string {
  return `import { RouterContext, RouterView, ThemeProvider, css, getInjectedCSS, globalCss, token } from 'vertz/ui';
import { appRouter } from './router';
import { appTheme, themeGlobals } from './styles/theme';
import { NavBar } from './components/nav-bar';

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

const styles = css({
  shell: { minHeight: '100vh', backgroundColor: token.color.background, color: token.color.foreground },
  main: { maxWidth: '42rem', marginInline: 'auto', paddingInline: token.spacing[6], paddingBlock: token.spacing[8] },
});

export { getInjectedCSS };
export const theme = appTheme;
export const globalStyles = [themeGlobals.css, appGlobals.css];

export function App() {
  return (
    <div data-testid="app-root">
      <RouterContext.Provider value={appRouter}>
        <ThemeProvider theme="light">
          <div className={styles.shell}>
            <NavBar />
            <main className={styles.main}>
              <RouterView
                router={appRouter}
                fallback={() => <div>Page not found</div>}
              />
            </main>
          </div>
        </ThemeProvider>
      </RouterContext.Provider>
    </div>
  );
}
`;
}

/**
 * src/pages/home.tsx for hello-world — reactive counter demonstrating
 * the Vertz compiler's signal transformation (let → signal)
 */
export function helloWorldHomePageTemplate(): string {
  return `import { css, token } from 'vertz/ui';
import { Button } from '@vertz/ui/components';

const styles = css({
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBlock: token.spacing[16], gap: token.spacing[6] },
  title: { fontSize: token.font.size['4xl'], fontWeight: token.font.weight.bold, color: token.color.foreground },
  subtitle: { color: token.color['muted-foreground'], fontSize: token.font.size.lg },
  count: { fontSize: token.font.size['5xl'], fontWeight: token.font.weight.bold, color: token.color.primary },
  actions: { display: 'flex', gap: token.spacing[3] },
});

export function HomePage() {
  let count = 0;

  return (
    <div className={styles.container} data-testid="home-page">
      <h1 className={styles.title}>Hello, Vertz!</h1>
      <p className={styles.subtitle}>A reactive counter powered by the Vertz compiler</p>
      <p className={styles.count}>{count}</p>
      <div className={styles.actions}>
        <Button intent="ghost" onClick={() => { count = 0; }}>Reset</Button>
        <Button onClick={() => { count++; }}>Count is {count}</Button>
      </div>
    </div>
  );
}
`;
}

/**
 * src/router.tsx for hello-world — route definitions + router instance
 */
export function helloWorldRouterTemplate(): string {
  return `import { createRouter, defineRoutes } from 'vertz/ui';
import { HomePage } from './pages/home';
import { AboutPage } from './pages/about';

export const routes = defineRoutes({
  '/': {
    component: () => <HomePage />,
  },
  '/about': {
    component: () => <AboutPage />,
  },
});

export const appRouter = createRouter(routes);
`;
}

/**
 * src/pages/about.tsx for hello-world — simple second page
 */
export function helloWorldAboutPageTemplate(): string {
  return `import { css, token } from 'vertz/ui';

const styles = css({
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingBlock: token.spacing[16], gap: token.spacing[4] },
  title: { fontSize: token.font.size['3xl'], fontWeight: token.font.weight.bold, color: token.color.foreground },
  text: { color: token.color['muted-foreground'], fontSize: token.font.size.lg, maxWidth: '32rem', textAlign: 'center' },
  code: { fontFamily: token.font.family.mono, backgroundColor: token.color.muted, paddingInline: token.spacing[2], paddingBlock: token.spacing[1], borderRadius: token.radius.sm, fontSize: token.font.size.sm },
});

export function AboutPage() {
  return (
    <div className={styles.container} data-testid="about-page">
      <h1 className={styles.title}>About</h1>
      <p className={styles.text}>
        This app was built with Vertz — a type-safe, LLM-native framework.
      </p>
      <p className={styles.text}>
        Edit this page at <code className={styles.code}>src/pages/about.tsx</code>
      </p>
    </div>
  );
}
`;
}

/**
 * src/components/nav-bar.tsx for hello-world — navigation with Link
 */
export function helloWorldNavBarTemplate(): string {
  return `import { Link, css, token } from 'vertz/ui';

const styles = css({
  nav: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: token.spacing[6], paddingBlock: token.spacing[4], borderBottomWidth: '1px', borderColor: token.color.border },
  brand: { fontSize: token.font.size.lg, fontWeight: token.font.weight.bold, color: token.color.foreground },
  links: { display: 'flex', gap: token.spacing[4] },
  link: { fontSize: token.font.size.sm, color: token.color['muted-foreground'], transition: 'colors', '&:hover': { color: token.color.foreground } },
  active: { color: token.color.foreground, fontWeight: token.font.weight.medium },
});

export function NavBar() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>My Vertz App</div>
      <div className={styles.links}>
        <Link href="/" className={styles.link} activeClass={styles.active}>Home</Link>
        <Link href="/about" className={styles.link} activeClass={styles.active}>About</Link>
      </div>
    </nav>
  );
}
`;
}

// ── Landing Page template functions ────────────────────────

/**
 * CLAUDE.md for landing-page — UI-only static site with section composition
 */
export function landingPageClaudeMdTemplate(projectName: string): string {
  return `# ${projectName}

A static landing page built with [Vertz](https://vertz.dev).

## Stack

- Runtime: Vertz (vtz)
- Framework: Vertz (UI)
- Language: TypeScript (strict mode)
- Docs: https://docs.vertz.dev

## Development

\`\`\`bash
vtz install          # Install dependencies
vtz dev              # Start dev server with HMR
vtz build            # Production build
\`\`\`

## Project Structure

- \`src/pages/\` — Page components (one per route)
- \`src/components/\` — Reusable section components (hero, features, etc.)
- \`src/styles/\` — Theme configuration and global styles
- \`src/router.tsx\` — Route definitions
- \`src/app.tsx\` — App layout with Nav, Footer, and RouterView

## Dev Server Tools

The dev server exposes built-in MCP tools and HTTP endpoints for AI agents.
See \`.claude/rules/dev-server-tools.md\` for the full list.

**Key rule:** Always call \`vertz_get_errors\` after code changes before reporting success.

## Adding a Section

1. Create a component in \`src/components/\` (e.g., \`testimonials-section.tsx\`)
2. Import and add it to \`src/pages/home.tsx\` in the desired position

## Adding a Page

1. Create a component in \`src/pages/\` (e.g., \`blog.tsx\`)
2. Add a route entry in \`src/router.tsx\`
3. Add a navigation link in \`src/components/nav.tsx\`

## Conventions

- See \`.claude/rules/\` for UI development conventions
- Refer to https://docs.vertz.dev for full framework documentation
- The Vertz compiler handles all reactivity — never use \`.value\`, \`signal()\`, or \`computed()\` manually
- Use \`css()\` for scoped styles, \`globalCss()\` for page-level styles
- Use section components to compose pages — each section is self-contained

## Common Mistakes

- **DON'T** use \`signal()\`, \`.value\`, or \`computed()\` manually — use \`let\` for state, \`const\` for derived values. The compiler handles reactivity.
- **DON'T** call components as functions — always use JSX: \`<Hero />\`, not \`Hero()\`.
- **DON'T** annotate component return types — let TypeScript infer from JSX.

## Adding a Backend

To add API and database support, see https://docs.vertz.dev/guides/server/overview
`;
}

/**
 * Package.json for landing-page — same deps as hello-world, no backend
 */
export function landingPagePackageJsonTemplate(projectName: string): string {
  const pkg = {
    name: projectName,
    version: '0.1.0',
    type: 'module',
    license: 'MIT',
    scripts: {
      dev: 'vertz dev',
      build: 'vertz build',
      test: 'vertz test',
    },
    dependencies: {
      vertz: '^0.2.0',
      '@vertz/theme-shadcn': '^0.2.0',
    },
    devDependencies: {
      '@vertz/cli': '^0.2.0',
      '@vertz/test': '^0.2.0',
      typescript: '^5.8.0',
    },
  };

  return JSON.stringify(pkg, null, 2);
}

/**
 * src/app.tsx for landing-page — dark theme, Nav + Footer in layout, RouterView
 */
export function landingPageAppTemplate(): string {
  return `import { RouterContext, RouterView, ThemeProvider, css, getInjectedCSS, token } from 'vertz/ui';
import { appRouter } from './router';
import { Nav } from './components/nav';
import { Footer } from './components/footer';
import { appTheme, themeGlobals } from './styles/theme';
import { appGlobals } from './styles/globals';

const styles = css({
  shell: { minHeight: '100vh' },
  main: { maxWidth: '64rem', marginInline: 'auto', paddingInline: token.spacing[6] },
});

export { getInjectedCSS };
export const theme = appTheme;
export const globalStyles = [themeGlobals.css, appGlobals.css];

export function App() {
  return (
    <RouterContext.Provider value={appRouter}>
      <ThemeProvider theme="dark">
        <div className={styles.shell}>
          <Nav />
          <main className={styles.main}>
            <RouterView
              router={appRouter}
              fallback={() => <div>Page not found</div>}
            />
          </main>
          <Footer />
        </div>
      </ThemeProvider>
    </RouterContext.Provider>
  );
}
`;
}

/**
 * src/styles/globals.ts for landing-page — dark body, smooth scroll, link reset
 */
export function landingPageGlobalsTemplate(): string {
  return `import { globalCss } from 'vertz/ui';

export const appGlobals = globalCss({
  html: {
    scrollBehavior: 'smooth',
  },
  'html body': {
    backgroundColor: '#111110',
    fontFamily: 'var(--font-sans)',
    color: '#E8E4DC',
    WebkitFontSmoothing: 'antialiased',
    MozOsxFontSmoothing: 'grayscale',
  },
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});
`;
}

/**
 * src/router.tsx for landing-page — three routes: home, features, pricing
 */
export function landingPageRouterTemplate(): string {
  return `import { createRouter, defineRoutes } from 'vertz/ui';
import { HomePage } from './pages/home';
import { FeaturesPage } from './pages/features';
import { PricingPage } from './pages/pricing';

export const routes = defineRoutes({
  '/': {
    component: () => <HomePage />,
  },
  '/features': {
    component: () => <FeaturesPage />,
  },
  '/pricing': {
    component: () => <PricingPage />,
  },
});

export const appRouter = createRouter(routes);
`;
}

/**
 * src/components/nav.tsx for landing-page — fixed top nav with backdrop blur
 */
export function landingPageNavTemplate(): string {
  return `import { Link, css, token } from 'vertz/ui';

const styles = css({
  nav: { position: 'fixed', zIndex: '50', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: token.spacing[6], paddingBlock: token.spacing[4], '&': { top: '0', left: '0', right: '0', background: 'rgba(17,17,16,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #2A2826' } },
  brand: { fontSize: token.font.size.lg, fontWeight: token.font.weight.bold },
  links: { display: 'flex', alignItems: 'center', gap: token.spacing[6] },
  link: { fontSize: token.font.size.sm, transition: 'colors', '&': { color: '#9C9690' }, '&:hover': { color: '#E8E4DC' } },
});

export function Nav() {
  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.brand}>My Site</Link>
      <div className={styles.links}>
        <Link href="/features" className={styles.link}>Features</Link>
        <Link href="/pricing" className={styles.link}>Pricing</Link>
      </div>
    </nav>
  );
}
`;
}

/**
 * src/components/footer.tsx for landing-page — footer with links
 */
export function landingPageFooterTemplate(): string {
  return `import { css, token } from 'vertz/ui';

const styles = css({
  footer: { paddingBlock: token.spacing[12], paddingInline: token.spacing[6], '&': { borderTop: '1px solid #2A2826' } },
  container: { maxWidth: '64rem', marginInline: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: token.font.size.xs, '&': { color: '#6B6560' } },
  links: { display: 'flex', alignItems: 'center', gap: token.spacing[4] },
  link: { transition: 'colors', '&:hover': { color: '#E8E4DC' } },
});

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <span>Built with Vertz</span>
        <div className={styles.links}>
          <a href="https://vertz.dev" target="_blank" rel="noopener" className={styles.link}>Vertz</a>
          <a href="https://docs.vertz.dev" target="_blank" rel="noopener" className={styles.link}>Docs</a>
        </div>
      </div>
    </footer>
  );
}
`;
}

/**
 * src/components/hero.tsx for landing-page — hero section with headline and CTA
 */
export function landingPageHeroTemplate(): string {
  return `import { css, token } from 'vertz/ui';
import { Button } from '@vertz/ui/components';

const styles = css({
  section: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: token.spacing[6], '&': { paddingTop: '10rem', paddingBottom: '6rem' }, '@media (min-width: 768px)': { paddingBottom: '8rem' } },
  headline: { fontSize: token.font.size['4xl'], fontWeight: token.font.weight.bold, '&': { color: '#E8E4DC', lineHeight: '1.1' }, '@media (min-width: 768px)': { fontSize: '3.5rem' } },
  subtitle: { fontSize: token.font.size.lg, maxWidth: '42rem', '&': { color: '#9C9690' } },
  actions: { display: 'flex', gap: token.spacing[3], marginTop: token.spacing[4] },
});

export function Hero() {
  return (
    <section className={styles.section}>
      <h1 className={styles.headline}>Build something amazing</h1>
      <p className={styles.subtitle}>
        A modern landing page built with Vertz. Edit the sections in src/components/ to make it yours.
      </p>
      <div className={styles.actions}>
        <Button intent="primary" size="lg">Get Started</Button>
        <Button intent="ghost" size="lg">Learn More</Button>
      </div>
    </section>
  );
}
`;
}

/**
 * src/components/features-section.tsx for landing-page — feature cards grid
 */
export function landingPageFeaturesSectionTemplate(): string {
  return `import { css, token } from 'vertz/ui';

const styles = css({
  section: { paddingBlock: token.spacing[16] },
  heading: { fontSize: token.font.size['2xl'], fontWeight: token.font.weight.bold, textAlign: 'center', marginBottom: token.spacing[12], '&': { color: '#E8E4DC' } },
  grid: { display: 'grid', gap: token.spacing[8], '@media (min-width: 768px)': { gridTemplateColumns: 'repeat(3, 1fr)' } },
  card: { display: 'flex', flexDirection: 'column', gap: token.spacing[3], padding: token.spacing[6], '&': { borderRadius: '8px', border: '1px solid #2A2826', background: 'rgba(17,17,16,0.5)' } },
  icon: { fontSize: token.font.size['2xl'] },
  title: { fontSize: token.font.size.lg, fontWeight: token.font.weight.semibold, '&': { color: '#E8E4DC' } },
  desc: { fontSize: token.font.size.sm, '&': { color: '#9C9690', lineHeight: '1.6' } },
});

const FEATURES = [
  { icon: '⚡', title: 'Lightning Fast', desc: 'Built for performance from the ground up. Zero overhead, maximum speed.' },
  { icon: '🔒', title: 'Type Safe', desc: 'End-to-end type safety from database to UI. If it builds, it works.' },
  { icon: '🤖', title: 'AI Native', desc: 'Designed for LLMs to use correctly on the first try. One pattern per task.' },
];

export function FeaturesSection() {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Features</h2>
      <div className={styles.grid}>
        {FEATURES.map((f) => (
          <div key={f.title} className={styles.card}>
            <span className={styles.icon}>{f.icon}</span>
            <h3 className={styles.title}>{f.title}</h3>
            <p className={styles.desc}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
`;
}

/**
 * src/components/cta-section.tsx for landing-page — call-to-action banner
 */
export function landingPageCtaSectionTemplate(): string {
  return `import { css, token } from 'vertz/ui';
import { Button } from '@vertz/ui/components';

const styles = css({
  section: { paddingBlock: token.spacing[16], display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: token.spacing[6], '&': { borderRadius: '12px', border: '1px solid #2A2826', background: 'rgba(200,69,27,0.04)', margin: '4rem 0', padding: '4rem 2rem' } },
  heading: { fontSize: token.font.size['2xl'], fontWeight: token.font.weight.bold, '&': { color: '#E8E4DC' } },
  desc: { fontSize: token.font.size.base, maxWidth: '32rem', '&': { color: '#9C9690' } },
});

export function CtaSection() {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Ready to get started?</h2>
      <p className={styles.desc}>
        Start building your project today. Edit any section to match your brand.
      </p>
      <Button intent="primary" size="lg">Get Started</Button>
    </section>
  );
}
`;
}

/**
 * src/pages/home.tsx for landing-page — composes Hero, FeaturesSection, CtaSection
 */
export function landingPageHomeTemplate(): string {
  return `import { Hero } from '../components/hero';
import { FeaturesSection } from '../components/features-section';
import { CtaSection } from '../components/cta-section';

export function HomePage() {
  return (
    <div>
      <Hero />
      <FeaturesSection />
      <CtaSection />
    </div>
  );
}
`;
}

/**
 * src/pages/features.tsx for landing-page — features detail page
 */
export function landingPageFeaturesPageTemplate(): string {
  return `import { css, token } from 'vertz/ui';

const styles = css({
  container: { paddingBlock: token.spacing[32], display: 'flex', flexDirection: 'column', gap: token.spacing[12] },
  title: { fontSize: token.font.size['3xl'], fontWeight: token.font.weight.bold, textAlign: 'center', '&': { color: '#E8E4DC' } },
  subtitle: { fontSize: token.font.size.lg, textAlign: 'center', maxWidth: '42rem', marginInline: 'auto', '&': { color: '#9C9690' } },
  grid: { display: 'grid', gap: token.spacing[8], marginTop: token.spacing[8], '@media (min-width: 768px)': { gridTemplateColumns: 'repeat(2, 1fr)' } },
  card: { display: 'flex', flexDirection: 'column', gap: token.spacing[3], padding: token.spacing[8], '&': { borderRadius: '8px', border: '1px solid #2A2826', background: 'rgba(17,17,16,0.5)' } },
  cardTitle: { fontSize: token.font.size.xl, fontWeight: token.font.weight.semibold, '&': { color: '#E8E4DC' } },
  cardDesc: { fontSize: token.font.size.sm, '&': { color: '#9C9690', lineHeight: '1.6' } },
});

export function FeaturesPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Features</h1>
      <p className={styles.subtitle}>
        Everything you need to build modern web applications.
      </p>
      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Reactive UI</h2>
          <p className={styles.cardDesc}>
            Write plain JavaScript. The compiler transforms your code into fine-grained reactive updates — no virtual DOM, no diffing.
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Type-Safe Routing</h2>
          <p className={styles.cardDesc}>
            Define routes with full TypeScript support. Route params, query strings, and navigation are all typed.
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Scoped Styling</h2>
          <p className={styles.cardDesc}>
            Use css() for component-scoped styles with design tokens. No class name collisions, no CSS-in-JS runtime.
          </p>
        </div>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Dark Theme</h2>
          <p className={styles.cardDesc}>
            Built-in theming with ThemeProvider. Switch between light and dark with a single prop change.
          </p>
        </div>
      </div>
    </div>
  );
}
`;
}

/**
 * src/pages/pricing.tsx for landing-page — pricing tiers with cards
 */
export function landingPagePricingPageTemplate(): string {
  return `import { css, token } from 'vertz/ui';
import { Button } from '@vertz/ui/components';

const styles = css({
  container: { paddingBlock: token.spacing[32], display: 'flex', flexDirection: 'column', gap: token.spacing[12] },
  title: { fontSize: token.font.size['3xl'], fontWeight: token.font.weight.bold, textAlign: 'center', '&': { color: '#E8E4DC' } },
  subtitle: { fontSize: token.font.size.lg, textAlign: 'center', maxWidth: '42rem', marginInline: 'auto', '&': { color: '#9C9690' } },
  grid: { display: 'grid', gap: token.spacing[8], marginTop: token.spacing[8], '@media (min-width: 768px)': { gridTemplateColumns: 'repeat(3, 1fr)' } },
  card: { display: 'flex', flexDirection: 'column', gap: token.spacing[4], padding: token.spacing[8], '&': { borderRadius: '8px', border: '1px solid #2A2826', background: 'rgba(17,17,16,0.5)' } },
  featured: [
    {
      '&': {
        border: '1px solid rgba(200,69,27,0.4)',
        background: 'rgba(200,69,27,0.04)',
      },
    },
  ],
  tierName: { fontSize: token.font.size.sm, textTransform: 'uppercase', letterSpacing: 'wider', '&': { color: '#6B6560' } },
  price: { fontSize: token.font.size['3xl'], fontWeight: token.font.weight.bold, '&': { color: '#E8E4DC' } },
  desc: { fontSize: token.font.size.sm, '&': { color: '#9C9690' } },
  features: { display: 'flex', flexDirection: 'column', gap: token.spacing[2], marginTop: token.spacing[4], '&': { flex: '1' } },
  feature: { fontSize: token.font.size.sm, '&': { color: '#9C9690' } },
});

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    desc: 'For side projects and experiments.',
    features: ['Up to 3 projects', 'Community support', 'Basic analytics'],
    featured: false,
  },
  {
    name: 'Pro',
    price: '$19',
    desc: 'For professionals and small teams.',
    features: ['Unlimited projects', 'Priority support', 'Advanced analytics', 'Custom domains'],
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    desc: 'For organizations at scale.',
    features: ['Everything in Pro', 'SSO & SAML', 'SLA guarantee', 'Dedicated support'],
    featured: false,
  },
];

export function PricingPage() {
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Pricing</h1>
      <p className={styles.subtitle}>
        Simple, transparent pricing. No hidden fees.
      </p>
      <div className={styles.grid}>
        {TIERS.map((tier) => (
          <div
            key={tier.name}
            className={[styles.card, tier.featured ? styles.featured : ''].join(' ')}
          >
            <span className={styles.tierName}>{tier.name}</span>
            <span className={styles.price}>{tier.price}<span className={styles.desc}>/mo</span></span>
            <p className={styles.desc}>{tier.desc}</p>
            <div className={styles.features}>
              {tier.features.map((f) => (
                <span key={f} className={styles.feature}>✓ {f}</span>
              ))}
            </div>
            <Button intent={tier.featured ? 'primary' : 'ghost'}>
              {tier.name === 'Enterprise' ? 'Contact Sales' : 'Get Started'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
`;
}

/**
 * .claude/rules/ui-development.md for landing-page — no backend/SDK content
 */
export function landingPageUiRuleTemplate(): string {
  return `# UI Development

## Imports

All Vertz UI packages are available through the \`vertz\` meta-package:

\`\`\`ts
import { css, globalCss, ThemeProvider } from 'vertz/ui';
import { Link, createRouter, defineRoutes } from 'vertz/ui';
import { Button, Input, Card } from '@vertz/ui/components';
\`\`\`

## Styling

### \`css()\` for scoped styles

\`\`\`ts
const styles = css({
  container: { display: 'flex', flexDirection: 'column', gap: token.spacing[6], paddingTop: token.spacing[16], paddingBottom: token.spacing[16] },
  heading: { fontSize: token.font.size['2xl'], fontWeight: token.font.weight.bold, color: '#E8E4DC' },
});

// Usage: className={styles.container}
\`\`\`

### \`globalCss()\` for page-level styles

\`\`\`ts
import { globalCss } from 'vertz/ui';

export const appGlobals = globalCss({
  html: { scrollBehavior: 'smooth' },
  'html body': { backgroundColor: '#111110', color: '#E8E4DC' },
});
\`\`\`

### Responsive design

Use \`@media\` queries inside \`css()\` style objects:

\`\`\`ts
const styles = css({
  grid: {
    display: 'grid',
    gap: token.spacing[8],
    '@media (min-width: 768px)': { gridTemplateColumns: 'repeat(3, 1fr)' },
  },
});
\`\`\`

## Routing

### Defining routes

\`\`\`ts
import { createRouter, defineRoutes } from 'vertz/ui';

const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/features': { component: () => <FeaturesPage /> },
});

export const appRouter = createRouter(routes);
\`\`\`

### Navigation

Use \`Link\` for client-side navigation:

\`\`\`tsx
import { Link } from 'vertz/ui';

<Link href="/features">Features</Link>
\`\`\`

## Section Composition

Pages are composed from self-contained section components:

\`\`\`tsx
// src/pages/home.tsx
import { Hero } from '../components/hero';
import { FeaturesSection } from '../components/features-section';

export function HomePage() {
  return (
    <div>
      <Hero />
      <FeaturesSection />
    </div>
  );
}
\`\`\`

Each section component lives in \`src/components/\` and manages its own styles.

## Theme

Theme is configured in \`src/styles/theme.ts\` using \`configureTheme\` from \`@vertz/theme-shadcn\`.
Global styles (body background, font smoothing) are in \`src/styles/globals.ts\`.
The \`ThemeProvider\` in \`app.tsx\` sets the theme mode (\`"dark"\` or \`"light"\`).

## Reactivity

The Vertz compiler transforms your code at build time:

- \`let count = 0\` → becomes a reactive signal
- \`const double = count * 2\` → becomes a computed value
- JSX attributes update automatically when signals change

**Never** use \`.value\`, \`signal()\`, or \`computed()\` manually — the compiler handles it.
`;
}

/**
 * .claude/rules/dev-server-tools.md — Dev server observability tools for LLMs
 */
export function devServerToolsRuleTemplate(): string {
  return `# Dev Server Tools

The Vertz dev server includes built-in tools for observing your running app.
Use these tools to verify your changes work before reporting success.

## MCP Server (automatic)

The dev server exposes an MCP server at:

\`\`\`
http://localhost:3000/__vertz_mcp
\`\`\`

Configure your AI tool to connect to this endpoint. The MCP server provides
the tools listed below — they are auto-discovered on connection.

## HTTP Bridge (optional)

For tools without MCP support, start the HTTP bridge:

\`\`\`bash
vtz dev --bridge-port 3001
\`\`\`

Call tools via plain HTTP:

\`\`\`bash
curl -X POST http://localhost:3001/command \\\\
  -H 'Content-Type: application/json' \\\\
  -d '{"tool": "vertz_get_errors", "args": {}}'
\`\`\`

## Available Tools

| Tool | Purpose |
|------|---------|
| \`vertz_get_errors\` | Current compilation/runtime errors with file paths, line numbers, and fix suggestions |
| \`vertz_render_page\` | SSR render a URL — returns HTML "text screenshot" with timing metadata |
| \`vertz_get_audit_log\` | Unified timeline of API requests, SSR renders, compilations, file changes, errors |
| \`vertz_get_diagnostics\` | Server health: uptime, cache stats, module graph, SSR pool metrics |
| \`vertz_get_api_spec\` | OpenAPI 3.1 spec with entity routes, schemas, and access rules |
| \`vertz_render_component\` | Render a single component in isolation with optional props |
| \`vertz_navigate\` | Navigate the browser to a URL via HMR WebSocket |
| \`vertz_get_events_url\` | WebSocket URL for real-time event push |

### Browser Interaction Tools

| Tool | Purpose |
|------|---------|
| \`vertz_browser_list_tabs\` | List connected browser tabs |
| \`vertz_browser_connect\` | Connect to a tab — returns session ID + initial page snapshot |
| \`vertz_browser_disconnect\` | Release a control session |
| \`vertz_browser_snapshot\` | Get current page state: interactive elements, forms, values |
| \`vertz_browser_click\` | Click an element (by ref, selector, or text) |
| \`vertz_browser_type\` | Type text into an input/textarea |
| \`vertz_browser_select\` | Select an option in a \`<select>\` |
| \`vertz_browser_fill_form\` | Fill multiple form fields at once |
| \`vertz_browser_submit\` | Submit a form (waits for navigation) |
| \`vertz_browser_press_key\` | Press a keyboard key (Enter, Escape, Tab, etc.) |
| \`vertz_browser_wait\` | Wait for a condition (text, selector, URL, element removal) |

## MANDATORY: Verify Before Reporting Success

After EVERY code change:

1. Call \`vertz_get_errors\` — check for compilation and type errors
2. Call \`vertz_get_audit_log\` with \`type: "error"\` — check for runtime errors
3. If you changed UI, call \`vertz_render_page\` — verify the page renders correctly
4. If you changed interactive behavior, use \`vertz_browser_connect\` → interact → verify
5. Only report success after all checks pass

**NEVER tell the user "it works" or "done" without first checking for errors via these tools.**
Common failure: the agent edits code, sees no editor errors, and declares success —
but the dev server has a build error or the page renders a blank screen.

## Real-Time Events

Subscribe to live updates instead of polling:

- **WebSocket:** \`ws://localhost:3000/__vertz_mcp/events\`
- **SSE (bridge):** \`GET http://localhost:3001/events\`

Event types: \`error_update\`, \`file_change\`, \`hmr_update\`, \`ssr_refresh\`, \`typecheck_update\`, \`server_status\`

Filter with query param: \`?subscribe=error_update,typecheck_update\`

## Direct HTTP Endpoints

These are always available without MCP or bridge:

- \`GET /__vertz_diagnostics\` — health snapshot (JSON)
- \`GET /__vertz_ai/errors\` — current errors
- \`GET /__vertz_ai/render?url=/path\` — SSR render
- \`GET /__vertz_ai/console?last=50\` — recent console output

Full docs: https://docs.vertz.dev/guides/dev-server-tools
`;
}
