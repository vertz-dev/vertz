// ── LLM rules templates ───────────────────────────────────

/**
 * CLAUDE.md — project-level instructions for LLMs
 */
export function claudeMdTemplate(projectName: string): string {
  return `# ${projectName}

A full-stack TypeScript application built with [Vertz](https://vertz.dev).

## Stack

- Runtime: Bun
- Framework: Vertz (full-stack TypeScript)
- Language: TypeScript (strict mode)
- Docs: https://docs.vertz.dev

## Development

\`\`\`bash
bun install          # Install dependencies
bun run dev          # Start dev server with HMR
bun run build        # Production build
\`\`\`

The dev server automatically runs codegen and migrations when files change.

## Conventions

- See \`.claude/rules/\` for API and UI development conventions
- Refer to https://docs.vertz.dev for full framework documentation
- Entity files use the \`.entity.ts\` suffix
- The Vertz compiler handles all reactivity — never use \`.value\`, \`signal()\`, or \`computed()\` manually
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
import { entity } from 'vertz/server';
import { postsModel } from '../schema';

export const posts = entity('posts', {
  model: postsModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
});
\`\`\`

### Entity Operations

Each entity automatically provides these operations:

| Operation | HTTP                    | Description                    |
| --------- | ----------------------- | ------------------------------ |
| \`list\`    | GET /api/<entity>       | List with filtering/pagination |
| \`get\`     | GET /api/<entity>/:id   | Get by ID                      |
| \`create\`  | POST /api/<entity>      | Create new record              |
| \`update\`  | PATCH /api/<entity>/:id | Update existing record         |
| \`delete\`  | DELETE /api/<entity>/:id| Delete record                  |

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
import { css, query, queryMatch, globalCss, ThemeProvider, variants } from 'vertz/ui';
import { api } from '../client';
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

### \`queryMatch()\` — Pattern matching for query states

\`\`\`tsx
{queryMatch(tasksQuery, {
  loading: () => <div>Loading...</div>,
  error: (err) => <div>Error: {err.message}</div>,
  data: (response) => (
    <div>
      {response.items.map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
})}
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
  container: ['flex', 'flex-col', 'gap:4', 'p:6'],
  heading: ['font:xl', 'font:bold', 'text:foreground'],
});

return <div className={styles.container}>...</div>;
\`\`\`

### Style Tokens

Styles use a token system (similar to Tailwind but with Vertz syntax):

- **Layout:** \`flex\`, \`grid\`, \`block\`, \`inline-flex\`
- **Spacing:** \`p:4\`, \`px:6\`, \`py:2\`, \`m:4\`, \`mx:auto\`, \`gap:2\`
- **Typography:** \`font:lg\`, \`font:bold\`, \`font:medium\`, \`text:foreground\`, \`text:sm\`
- **Colors:** \`bg:background\`, \`bg:primary.600\`, \`text:white\`, \`border:border\`
- **Sizing:** \`w:full\`, \`h:screen\`, \`max-w:2xl\`, \`min-h:screen\`
- **Borders:** \`rounded:md\`, \`rounded:lg\`, \`border:1\`, \`border:border\`
- **Flexbox:** \`items:center\`, \`justify:between\`, \`flex-1\`, \`flex-col\`

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
      '@vertz/ui-compiler': '^0.2.0',
      'bun-types': '^1.0.0',
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
      types: ['bun-types'],
    },
    include: ['src', '.vertz/generated'],
  };

  return JSON.stringify(tsconfig, null, 2);
}

/**
 * vertz.config.ts template — compiler entry + codegen config
 */
export function vertzConfigTemplate(): string {
  return `/** @type {import('@vertz/compiler').VertzConfig} */
export default {
  compiler: {
    entryFile: 'src/api/server.ts',
  },
};

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
 * bunfig.toml template — registers Vertz compiler plugin for Bun's dev server
 */
export function bunfigTemplate(): string {
  return `[serve.static]
plugins = ["./bun-plugin-shim.ts"]
`;
}

/**
 * bun-plugin-shim.ts — bridges bunfig.toml plugin format with createVertzBunPlugin
 */
export function bunPluginShimTemplate(): string {
  return `/**
 * Thin shim that wraps @vertz/ui-server/bun-plugin for bunfig.toml consumption.
 *
 * bunfig.toml \`[serve.static] plugins\` requires a default export of type BunPlugin.
 * The @vertz/ui-server/bun-plugin package exports a factory function (createVertzBunPlugin)
 * as a named export — this shim bridges the two.
 */
import { createVertzBunPlugin } from 'vertz/ui-server/bun-plugin';

const { plugin } = createVertzBunPlugin();

export default plugin;
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
  return `import { entity } from 'vertz/server';
import { tasksModel } from '../schema';

export const tasks = entity('tasks', {
  model: tasksModel,
  access: {
    list: () => true,
    get: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
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
  return `import { css, getInjectedCSS, globalCss, ThemeProvider } from 'vertz/ui';
import { HomePage } from './pages/home';
import { appTheme, themeGlobals } from './styles/theme';

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

const styles = css({
  shell: ['min-h:screen', 'bg:background', 'text:foreground'],
  header: [
    'flex',
    'items:center',
    'justify:between',
    'px:6',
    'py:4',
    'border-b:1',
    'border:border',
  ],
  title: ['font:lg', 'font:bold', 'text:foreground'],
  main: ['max-w:2xl', 'mx:auto', 'px:6', 'py:8'],
});

export { getInjectedCSS };
export const theme = appTheme;
export const globalStyles = [themeGlobals.css, appGlobals.css];

export function App() {
  return (
    <div data-testid="app-root">
      <ThemeProvider theme="light">
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.title}>My Vertz App</div>
          </header>
          <main className={styles.main}>
            <HomePage />
          </main>
        </div>
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
  ListTransition,
  css,
  fadeOut,
  form,
  globalCss,
  query,
  queryMatch,
  slideInFromTop,
  useDialogStack,
} from 'vertz/ui';
import { Button } from '@vertz/ui/components';
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
  container: ['py:2', 'w:full'],
  heading: ['font:xl', 'font:bold', 'text:foreground', 'mb:4'],
  form: ['flex', 'items:start', 'gap:2', 'mb:6'],
  inputWrap: ['flex-1'],
  input: [
    'w:full',
    'h:10',
    'px:3',
    'rounded:md',
    'border:1',
    'border:border',
    'bg:background',
    'text:foreground',
    'text:sm',
  ],
  fieldError: ['text:destructive', 'font:xs', 'mt:1'],
  list: ['flex', 'flex-col', 'gap:2'],
  item: [
    'flex',
    'items:center',
    'gap:3',
    'px:4',
    'py:3',
    'rounded:md',
    'border:1',
    'border:border',
    'bg:card',
    'hover:bg:accent',
    'transition:colors',
  ],
  checkbox: ['w:4', 'h:4', 'cursor:pointer', 'rounded:sm'],
  label: ['flex-1', 'text:sm', 'text:foreground'],
  labelDone: ['flex-1', 'text:sm', 'text:muted-foreground', 'decoration:line-through'],
  loading: ['text:muted-foreground'],
  error: ['text:destructive'],
  empty: ['text:muted-foreground', 'text:center', 'py:8'],
  count: ['text:xs', 'text:muted-foreground', 'mt:4'],
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

      {queryMatch(tasksQuery, {
        loading: () => (
          <div className={styles.loading}>Loading tasks...</div>
        ),
        error: (err) => (
          <div className={styles.error}>
            {err instanceof Error ? err.message : String(err)}
          </div>
        ),
        data: (response) => (
          <>
            {response.items.length === 0 && (
              <div className={styles.empty}>
                No tasks yet. Add one above!
              </div>
            )}
            <div data-testid="task-list" className={styles.list}>
              <ListTransition
                each={response.items}
                keyFn={(task) => task.id}
                children={(task) => (
                  <TaskItem
                    id={task.id}
                    title={task.title}
                    completed={task.completed}
                  />
                )}
              />
            </div>
            {response.items.length > 0 && (
              <div className={styles.count}>
                {response.items.filter((t) => !t.completed).length} remaining
              </div>
            )}
          </>
        ),
      })}
    </div>
  );
}
`;
}
