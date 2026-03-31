import {
  bunfigTemplate,
  bunPluginShimTemplate,
  entryClientTemplate,
  faviconTemplate,
  themeTemplate,
  uiDevelopmentRuleTemplate,
} from '../templates/index.js';
import type { Feature, FeatureContext } from './types.js';

function appContent(ctx: FeatureContext): string {
  const hasRouter = ctx.hasFeature('router');

  if (hasRouter) {
    return `import { css, getInjectedCSS, globalCss, RouterContext, RouterView, ThemeProvider } from 'vertz/ui';
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
  shell: ['min-h:screen', 'bg:background', 'text:foreground'],
  main: ['max-w:2xl', 'mx:auto', 'px:6', 'py:8'],
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

  // No router — direct page render (used by todo-app / full-stack preset)
  const hasClient = ctx.hasFeature('client');
  const homeImport = hasClient
    ? "import { HomePage } from './pages/home';"
    : '';
  const homeRender = hasClient ? '<HomePage />' : '<div>Hello, Vertz!</div>';

  return `import { css, getInjectedCSS, globalCss, ThemeProvider } from 'vertz/ui';
${homeImport}
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
            ${homeRender}
          </main>
        </div>
      </ThemeProvider>
    </div>
  );
}
`;
}

function helloWorldVertzConfig(): string {
  return `/** @type {import('@vertz/compiler').VertzConfig} */
export default {};
`;
}

export const uiFeature: Feature = {
  name: 'ui',
  dependencies: ['core'],

  files(ctx) {
    const files = [
      { path: 'bunfig.toml', content: bunfigTemplate() },
      { path: 'bun-plugin-shim.ts', content: bunPluginShimTemplate() },
      { path: 'src/app.tsx', content: appContent(ctx) },
      { path: 'src/entry-client.ts', content: entryClientTemplate() },
      { path: 'src/styles/theme.ts', content: themeTemplate() },
      { path: 'public/favicon.svg', content: faviconTemplate() },
      { path: '.claude/rules/ui-development.md', content: uiDevelopmentRuleTemplate() },
    ];

    // Only add vertz.config.ts if api feature doesn't provide one
    if (!ctx.hasFeature('api')) {
      files.push({ path: 'vertz.config.ts', content: helloWorldVertzConfig() });
    }

    return files;
  },

  packages(ctx) {
    const scripts: Record<string, string> = { build: 'vertz build' };
    // When api feature provides dev.ts, don't override with vertz dev
    if (!ctx.hasFeature('api')) {
      scripts.dev = 'vertz dev';
    }
    return {
      dependencies: {
        '@vertz/theme-shadcn': '^0.2.0',
      },
      devDependencies: {
        '@vertz/cli': '^0.2.0',
        '@vertz/ui-compiler': '^0.2.0',
      },
      scripts,
    };
  },
};
