# #1970: Default Template Should Include Router with Multiple Routes

## Problem

The `hello-world` template scaffolds a single-page app with no routing. Developers scaffolding a new project never see `defineRoutes`/`createRouter`/`RouterView` in action, leading them to build custom routing solutions before discovering the built-in router.

## API Surface

After this change, the scaffolded hello-world template will include:

### `src/router.tsx` — Route definitions + router instance

```tsx
import { defineRoutes, createRouter } from 'vertz/ui';
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
```

### `src/app.tsx` — App root with RouterContext.Provider + RouterView

The app wraps the entire shell in `RouterContext.Provider` so that `Link` and `useRouter()` work anywhere in the tree — including components rendered outside `RouterView` (like `NavBar`).

```tsx
import { css, getInjectedCSS, globalCss, RouterContext, RouterView, ThemeProvider } from 'vertz/ui';
import { appRouter } from './router';
import { appTheme, themeGlobals } from './styles/theme';
import { NavBar } from './components/nav-bar';

// ... styles, exports ...

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
```

### `src/components/nav-bar.tsx` — Navigation with Link

```tsx
import { css } from 'vertz/ui';
import { Link } from 'vertz/ui';

export function NavBar() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>My Vertz App</div>
      <div className={styles.links}>
        <Link href="/" activeClass={styles.active}>Home</Link>
        <Link href="/about" activeClass={styles.active}>About</Link>
      </div>
    </nav>
  );
}
```

### `src/pages/home.tsx` — Reactive counter (unchanged)

Keeps the reactive counter demonstrating `let` → signal.

### `src/pages/about.tsx` — Second page

```tsx
import { css } from 'vertz/ui';

export function AboutPage() {
  return (
    <div className={styles.container} data-testid="about-page">
      <h1 className={styles.title}>About</h1>
      <p className={styles.text}>
        This app was built with Vertz — a type-safe, LLM-native framework.
      </p>
      <p className={styles.text}>
        Edit this page at <code>src/pages/about.tsx</code>
      </p>
    </div>
  );
}
```

## Manifesto Alignment

- **"One way to do things"** — The template shows THE way to do routing in Vertz. No custom solutions needed.
- **"AI agents are first-class users"** — An LLM scaffolding a project immediately sees the routing pattern and can replicate it for new pages.
- **"If you can't demo it, it's not done"** — The scaffolded app has clickable navigation between two pages out of the box.

## Non-Goals

- **No nested routes / layouts** — The hello-world template is meant to be minimal. Nested layouts are demonstrated in the todo-app template and examples.
- **No loaders** — Route loaders are a backend concern; hello-world is UI-only.
- **No search params** — Would add complexity without teaching a core concept.
- **No lazy loading** — Both pages are tiny; code splitting would be premature.

## Unknowns

None identified. The router API is stable and well-tested. The template changes are purely additive string template modifications.

## POC Results

Not applicable — this is a template change, not a new API.

## Type Flow Map

No new generics introduced. The template uses existing APIs:
- `defineRoutes()` → `TypedRoutes<T>` (generic from route map)
- `createRouter(routes)` → `Router<T>` (generic flows through)
- `RouterView({ router })` → renders matched component
- `Link({ href })` → typed href from route map (RoutePaths<T>)
- `useRouter()` → typed navigate() from RouterContext

## E2E Acceptance Test

### Scaffold test: hello-world template creates router files

```ts
describe('hello-world template', () => {
  it('creates src/router.tsx with defineRoutes and createRouter', async () => {
    await scaffold(tempDir, { projectName: 'test-app', template: 'hello-world' });
    const content = await fs.readFile(projectPath('src', 'router.tsx'), 'utf-8');
    expect(content).toContain('defineRoutes');
    expect(content).toContain('createRouter');
  });

  it('creates src/pages/about.tsx with AboutPage', async () => {
    await scaffold(tempDir, { projectName: 'test-app', template: 'hello-world' });
    const content = await fs.readFile(projectPath('src', 'pages', 'about.tsx'), 'utf-8');
    expect(content).toContain('export function AboutPage()');
  });

  it('creates src/components/nav-bar.tsx with Link navigation', async () => {
    await scaffold(tempDir, { projectName: 'test-app', template: 'hello-world' });
    const content = await fs.readFile(projectPath('src', 'components', 'nav-bar.tsx'), 'utf-8');
    expect(content).toContain('Link');
    expect(content).toContain("href=\"/\"");
    expect(content).toContain("href=\"/about\"");
  });

  it('app.tsx uses RouterView instead of direct HomePage', async () => {
    await scaffold(tempDir, { projectName: 'test-app', template: 'hello-world' });
    const content = await fs.readFile(projectPath('src', 'app.tsx'), 'utf-8');
    expect(content).toContain('RouterView');
    expect(content).toContain('appRouter');
    expect(content).not.toContain('<HomePage />');
  });

  // @ts-expect-error — wrong template reference should fail
  it('invalid: old test checking for no router should now fail', () => {
    // This validates the template HAS routing now
  });
});
```

### Template content test: router template uses correct imports

```ts
describe('helloWorldRouterTemplate', () => {
  it('imports defineRoutes and createRouter from vertz/ui', () => {
    const result = helloWorldRouterTemplate();
    expect(result).toContain("from 'vertz/ui'");
    expect(result).toContain('defineRoutes');
    expect(result).toContain('createRouter');
  });

  it('defines two routes: / and /about', () => {
    const result = helloWorldRouterTemplate();
    expect(result).toContain("'/'");
    expect(result).toContain("'/about'");
  });
});
```

---

## Implementation Plan

### Phase 1: New Template Functions + Router File

**What:** Add new template functions (`helloWorldRouterTemplate`, `helloWorldAboutPageTemplate`, `helloWorldNavBarTemplate`) and modify existing ones (`helloWorldAppTemplate`, `helloWorldHomePageTemplate`).

**Files changed:**
- `packages/create-vertz-app/src/templates/index.ts` — add new template functions, modify existing hello-world templates
- `packages/create-vertz-app/src/scaffold.ts` — add `src/router.tsx`, `src/pages/about.tsx`, `src/components/nav-bar.tsx` to hello-world scaffold; add `mkdir` for `src/components/`
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` — tests for new template functions
- `packages/create-vertz-app/src/__tests__/scaffold.test.ts` — tests for new files in scaffolded output; update existing tests that check `app.tsx` content (e.g., the test checking for `<HomePage />` must be updated since `app.tsx` now uses `RouterView` instead)

**Acceptance Criteria:**

```ts
describe('Feature: Hello-world template includes router', () => {
  describe('Given the hello-world template is scaffolded', () => {
    describe('When inspecting the generated files', () => {
      it('Then src/router.tsx exists with defineRoutes and createRouter', () => {});
      it('Then src/pages/about.tsx exists with AboutPage component', () => {});
      it('Then src/components/nav-bar.tsx exists with Link navigation', () => {});
      it('Then src/app.tsx uses RouterView instead of direct HomePage', () => {});
      it('Then src/app.tsx imports appRouter from ./router', () => {});
      it('Then src/pages/home.tsx still has the reactive counter', () => {});
    });
  });

  describe('Given the helloWorldRouterTemplate function', () => {
    describe('When called', () => {
      it('Then returns a string with defineRoutes and createRouter imports from vertz/ui', () => {});
      it('Then defines / and /about routes', () => {});
      it('Then exports routes and appRouter', () => {});
    });
  });

  describe('Given the helloWorldAboutPageTemplate function', () => {
    describe('When called', () => {
      it('Then returns a string with AboutPage component', () => {});
      it('Then includes edit hint pointing to src/pages/about.tsx', () => {});
    });
  });

  describe('Given the helloWorldNavBarTemplate function', () => {
    describe('When called', () => {
      it('Then returns a string with Link components for / and /about', () => {});
      it('Then uses activeClass for current route highlighting', () => {});
    });
  });

  describe('Given the modified helloWorldAppTemplate', () => {
    describe('When called', () => {
      it('Then imports RouterContext, RouterView from vertz/ui', () => {});
      it('Then imports appRouter from ./router', () => {});
      it('Then imports NavBar from ./components/nav-bar', () => {});
      it('Then wraps the app in RouterContext.Provider with appRouter', () => {});
      it('Then renders NavBar in the header area', () => {});
      it('Then uses RouterView with appRouter and a fallback', () => {});
      it('Then does NOT directly render HomePage', () => {});
    });
  });

  describe('Given the scaffold directory structure', () => {
    describe('When hello-world template is scaffolded', () => {
      it('Then src/components/ directory is created', () => {});
    });
  });
});
```

**Type flow:** No new generics — uses existing router APIs.

### Phase 2: Update LLM Rules + CLAUDE.md

**What:** Update `helloWorldClaudeMdTemplate` and `uiDevelopmentRuleTemplate` to reference routing patterns, so LLMs scaffolding on top of the hello-world template know how to add new routes.

**Files changed:**
- `packages/create-vertz-app/src/templates/index.ts` — update CLAUDE.md template to mention routing
- `packages/create-vertz-app/src/templates/__tests__/templates.test.ts` — tests for updated content

**Acceptance Criteria:**

```ts
describe('Feature: LLM rules mention routing pattern', () => {
  describe('Given the hello-world CLAUDE.md template', () => {
    describe('When inspecting the content', () => {
      it('Then mentions defineRoutes for adding new pages', () => {});
      it('Then mentions src/router.tsx as the routing entry point', () => {});
    });
  });
});
```
