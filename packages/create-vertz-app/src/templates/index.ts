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
      codegen: 'vertz codegen',
    },
    imports: {
      '#generated': './.vertz/generated/client.ts',
      '#generated/types': './.vertz/generated/types/index.ts',
    },
    dependencies: {
      '@vertz/db': '^0.2.0',
      '@vertz/server': '^0.2.0',
      '@vertz/theme-shadcn': '^0.2.0',
      '@vertz/ui': '^0.2.0',
    },
    devDependencies: {
      '@vertz/cli': '^0.2.0',
      '@vertz/ui-compiler': '^0.2.0',
      '@vertz/ui-server': '^0.2.0',
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
`;
}

/**
 * .env.example template
 */
export function envExampleTemplate(): string {
  return `PORT=3000
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
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

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
 * src/api/server.ts — createServer with entities + db
 */
export function serverTemplate(): string {
  return `import { createServer } from '@vertz/server';
import { db } from './db';
import { tasks } from './entities/tasks.entity';

const app = createServer({
  basePath: '/api',
  entities: [tasks],
  db,
});

export default app;

if (import.meta.main) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT).then((handle) => {
    console.log(\`Server running at http://localhost:\${handle.port}/api\`);
  });
}
`;
}

/**
 * src/api/schema.ts — tasks table + model
 */
export function schemaTemplate(): string {
  return `import { d } from '@vertz/db';

export const tasksTable = d.table('tasks', {
  id: d.uuid().primary({ generate: 'uuid' }),
  title: d.text(),
  completed: d.boolean().default(false),
  createdAt: d.timestamp().default('now').readOnly(),
  updatedAt: d.timestamp().autoUpdate().readOnly(),
});

export const tasksModel = d.model(tasksTable);
`;
}

/**
 * src/api/db.ts — createSqliteAdapter with autoApply migrations
 */
export function dbTemplate(): string {
  return `import { createSqliteAdapter } from '@vertz/db/sqlite';
import { tasksTable } from './schema';

export const db = await createSqliteAdapter({
  schema: tasksTable,
  migrations: { autoApply: true },
});
`;
}

/**
 * src/api/entities/tasks.entity.ts — entity with CRUD access
 */
export function tasksEntityTemplate(): string {
  return `import { entity } from '@vertz/server';
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
  return `import { css, getInjectedCSS, globalCss, ThemeProvider } from '@vertz/ui';
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
        <div class={styles.shell}>
          <header class={styles.header}>
            <div class={styles.title}>My Vertz App</div>
          </header>
          <main class={styles.main}>
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
  return `import { mount } from '@vertz/ui';
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

const { theme, globals } = configureTheme({
  palette: 'zinc',
  radius: 'md',
});

export const appTheme = theme;
export const themeGlobals = globals;
`;
}

/**
 * src/pages/home.tsx — task list + create form with query + css
 */
export function homePageTemplate(): string {
  return `import {
  ANIMATION_DURATION,
  ANIMATION_EASING,
  ListTransition,
  css,
  fadeOut,
  globalCss,
  query,
  queryMatch,
  slideInFromTop,
} from '@vertz/ui';
import { api } from '../client';

// Inject global CSS for list item enter/exit animations
void globalCss({
  '[data-presence="enter"]': {
    animation: \`\${slideInFromTop} \${ANIMATION_DURATION} \${ANIMATION_EASING}\`,
  },
  '[data-presence="exit"]': {
    animation: \`\${fadeOut} \${ANIMATION_DURATION} \${ANIMATION_EASING}\`,
    overflow: 'hidden',
  },
});

const pageStyles = css({
  container: ['py:2', 'w:full'],
  heading: ['font:xl', 'font:bold', 'text:foreground', 'mb:4'],
  form: ['flex', 'gap:2', 'mb:6'],
  input: [
    'flex-1',
    'px:3',
    'py:2',
    'rounded:md',
    'border:1',
    'border:border',
    'bg:background',
    'text:foreground',
  ],
  button: [
    'px:4',
    'py:2',
    'rounded:md',
    'bg:primary.600',
    'text:white',
    'font:medium',
    'cursor:pointer',
  ],
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
  ],
  loading: ['text:muted-foreground'],
  error: ['text:destructive'],
  empty: ['text:muted-foreground', 'text:center', 'py:8'],
});

export function HomePage() {
  const tasksQuery = query(api.tasks.list());

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const data = new FormData(form);
    const title = data.get('title') as string;
    if (!title.trim()) return;

    await api.tasks.create({ title });
    form.reset();
    tasksQuery.refetch();
  };

  return (
    <div class={pageStyles.container} data-testid="home-page">
      <h1 class={pageStyles.heading}>Tasks</h1>

      <form class={pageStyles.form} onSubmit={handleSubmit}>
        <input
          name="title"
          class={pageStyles.input}
          placeholder="What needs to be done?"
          required
        />
        <button type="submit" class={pageStyles.button}>
          Add
        </button>
      </form>

      {queryMatch(tasksQuery, {
        loading: () => (
          <div class={pageStyles.loading}>Loading tasks...</div>
        ),
        error: (err) => (
          <div class={pageStyles.error}>
            {err instanceof Error ? err.message : String(err)}
          </div>
        ),
        data: (response) => (
          <>
            {response.items.length === 0 && (
              <div class={pageStyles.empty}>
                No tasks yet. Add one above!
              </div>
            )}
            <div data-testid="task-list" class={pageStyles.list}>
              <ListTransition
                each={response.items}
                keyFn={(task) => task.id}
                children={(task) => (
                  <div class={pageStyles.item}>
                    <span>{task.title}</span>
                  </div>
                )}
              />
            </div>
          </>
        ),
      })}
    </div>
  );
}
`;
}
