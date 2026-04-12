# AppShell Layout Component

**Issue:** [#1661](https://github.com/vertz-dev/vertz/issues/1661)
**Status:** Design Review (Rev 2 — addressing DX, Product, Technical reviews)

---

## Naming: Why "AppShell" over "WorkspaceShell"

The issue proposes `WorkspaceShell`. We use `AppShell` because:

1. **Generic applicability** — `WorkspaceShell` implies multi-tenant workspace semantics. `AppShell` works for any app (single-tenant, multi-tenant, admin panels, dashboards). The component is a layout primitive, not a workspace abstraction.
2. **Sub-components disambiguate** — An LLM seeing `AppShell.Sidebar`, `AppShell.Nav`, `AppShell.Content` immediately understands this is a sidebar layout, regardless of the root name. The compound pattern removes ambiguity about what "shell" means.
3. **Established term** — `AppShell` is the recognized name for this pattern in UI libraries (Mantine, Angular Material). LLMs have strong training signal for it. `WorkspaceShell` has no prior art.

### Relationship to NavigationMenu

`NavigationMenu` (existing primitive) is for **horizontal navigation bars** with dropdowns, keyboard arrow navigation, and hover triggers — typically used in site headers or top bars.

`AppShell.Nav` is a **vertical sidebar navigation** container. They are complementary, not overlapping:

```tsx
// Top navigation → NavigationMenu
<header><NavigationMenu>{/* dropdown menus */}</NavigationMenu></header>

// Sidebar navigation → AppShell.Nav
<AppShell.Sidebar>
  <AppShell.Nav>{/* vertical nav items */}</AppShell.Nav>
</AppShell.Sidebar>
```

Developers should never be confused about which to use — if it's inside a sidebar, it's `AppShell.Nav`. If it's a horizontal menu bar, it's `NavigationMenu`.

---

## API Surface

### Composable sub-component API

AppShell follows the established compound component pattern (Card, Dialog, Alert):

```tsx
import { AppShell } from '@vertz/ui/components';
import { Outlet } from '@vertz/ui';
import { Folder, Settings } from '@vertz/icons';

function WorkspaceLayout() {
  return (
    <AppShell>
      <AppShell.Sidebar>
        <AppShell.Brand>
          <AppLogo />
          My App
        </AppShell.Brand>

        <AppShell.Nav>
          <AppShell.NavItem href="/projects" icon={Folder}>
            Projects
          </AppShell.NavItem>
          <AppShell.NavItem href="/settings" icon={Settings}>
            Settings
          </AppShell.NavItem>
        </AppShell.Nav>

        <AppShell.User>
          <img src={user.avatarUrl} alt="" />
          <span>{user.name}</span>
          <Button intent="ghost" size="xs" onClick={handleSignOut}>
            Sign out
          </Button>
        </AppShell.User>
      </AppShell.Sidebar>

      <AppShell.Content>
        <Outlet />
      </AppShell.Content>
    </AppShell>
  );
}
```

### Dynamic content alongside NavItems

NavItems and custom elements freely coexist inside `AppShell.Nav`. This is the primary use case from the Linear clone reference:

```tsx
<AppShell.Nav>
  <AppShell.NavItem href="/projects" icon={Folder}>
    Projects
  </AppShell.NavItem>

  {/* Dynamic project links — plain Link elements, styled by developer */}
  {projects.data?.items.map((project) => (
    <Link
      href={`/projects/${project.id}`}
      className={customProjectLinkStyle}
      key={project.id}
    >
      {`${project.key} — ${project.name}`}
    </Link>
  ))}

  <AppShell.NavItem href="/settings" icon={Settings}>
    Settings
  </AppShell.NavItem>
</AppShell.Nav>
```

`AppShell.NavItem` provides themed styling + icon + active state. For custom nav content (dynamic lists, section headers, dividers), developers use any elements inside `AppShell.Nav`.

### Route integration

AppShell is a layout component used in the route tree:

```tsx
import { defineRoutes, createRouter } from '@vertz/ui';

const routes = defineRoutes({
  '/login': { component: () => <LoginPage /> },
  '/': {
    component: () => <ProtectedRoute><WorkspaceLayout /></ProtectedRoute>,
    children: {
      '/dashboard': { component: () => <DashboardPage /> },
      '/projects': { component: () => <ProjectsPage /> },
      '/projects/:id': { component: () => <ProjectDetailPage /> },
      '/settings': { component: () => <SettingsPage /> },
    },
  },
});
```

### Sub-component reference

| Sub-component | HTML element | `data-part` | Purpose |
|---|---|---|---|
| `AppShell` | `<div>` | `app-shell` | Root flex container (`flex`, `min-h:screen`) |
| `AppShell.Sidebar` | `<aside>` | `sidebar` | Fixed-width sidebar with flex-col layout |
| `AppShell.Brand` | `<div>` | `brand` | Brand/logo area at top of sidebar |
| `AppShell.Nav` | `<nav>` | `nav` | Navigation container (`flex-1` to push User to bottom) |
| `AppShell.NavItem` | `<Link>` (themed) | `nav-item` | Themed nav link with icon + active state. Emits `aria-current="page"` when active. |
| `AppShell.User` | `<div>` | `user` | User section pinned to sidebar bottom |
| `AppShell.Content` | `<main>` | `content` | Main content area (`flex-1`) |

### Props interfaces

```tsx
/** Slot props shared by structural sub-components. */
interface SlotProps {
  children?: ChildValue;
  className?: string;
}

// AppShell, AppShell.Sidebar, AppShell.Brand, AppShell.Nav,
// AppShell.User, AppShell.Content all use SlotProps.

/** Icon component type — matches @vertz/icons signature. */
type IconComponent = (props: { size?: number }) => HTMLElement;

/**
 * Themed nav link with automatic active state and optional icon.
 * Wraps Link internally — provides SPA navigation.
 */
interface AppShellNavItemProps {
  /** Target URL path. */
  href: string;
  children?: ChildValue;
  /** Icon component from @vertz/icons, rendered at 16px before the label. */
  icon?: IconComponent;
  /**
   * Active state matching strategy.
   * - `'prefix'` (default): active when pathname starts with href (e.g., `/projects` matches `/projects/123`)
   * - `'exact'`: active only on exact pathname match
   */
  match?: 'exact' | 'prefix';
  className?: string;
}
```

**NavItem defaults to `match: 'prefix'`** because sidebar nav items almost always represent sections with nested routes. A `/projects` NavItem should stay active when viewing `/projects/123`. This differs from `Link`'s default (exact match) because NavItem serves a different purpose — section-level navigation indicators.

### Class slots (primitive layer)

```tsx
interface AppShellClasses {
  root?: string;
  sidebar?: string;
  brand?: string;
  nav?: string;
  navItem?: string;
  navItemActive?: string;
  content?: string;
  user?: string;
}

type AppShellClassKey = keyof AppShellClasses;
```

Note: `navItem` and `navItemActive` are only used by the themed `NavItem` component, not the primitive. The primitive distributes structural classes (`root`, `sidebar`, `brand`, `nav`, `content`, `user`).

---

## Manifesto Alignment

### One way to do things

The issue proposes two APIs (props-based and composable). We choose **composable only** — it matches the established pattern (Card, Dialog, Alert) and is more flexible for custom content. One API, no ambiguity.

### If it builds, it works

Props interfaces are fully typed. `AppShellNavItemProps.href` is `string` in the primitive layer. The themed NavItem could accept `RoutePaths<T>` (same type as `Link.href`) to provide route type safety when the app has generated route types — this is a follow-up enhancement, not a blocker.

### AI agents are first-class users

The sub-component pattern (`AppShell.Sidebar`, `AppShell.Nav`) is highly predictable for LLMs — they've seen this pattern in React (Radix, Chakra) and in Vertz's own components. An LLM can scaffold a complete AppShell layout from the API surface above on the first prompt.

### One way to do things (NavItem vs. Link)

`AppShell.NavItem` is the way to add themed navigation items inside the shell. It wraps `Link` internally with icon + active state. For custom nav content (project lists, section headers, badges), developers use regular elements or `Link` directly inside `AppShell.Nav`.

### What was rejected

1. **Props-based API** (`<WorkspaceShell navItems={[...]} />`) — rigid, hard to extend with custom content (project lists, section dividers), not composable.
2. **NavItem as plain `<a>` tag** — loses SPA navigation. Since AppShell is always used inside a router context, NavItem should use Link.
3. **Desktop sidebar collapse** (icon-only mode) — valuable but separate concern. Can be added later as `AppShell.Sidebar collapsed` prop without breaking the composable API.
4. **Built-in auth** — auth is handled by `ProtectedRoute` at the route level. AppShell is layout-only.

---

## Non-Goals

- **Auth handling** — AppShell does not check authentication. That's `ProtectedRoute`'s job. AppShell only renders the layout.
- **Data fetching** — AppShell does not fetch user data, projects, or any app-specific data. The developer fetches data and passes it as children.
- **Desktop sidebar collapse/expand** — icon-only collapsed mode is a future enhancement, not part of this initial implementation.
- **Pre-built user dropdown** — `AppShell.User` is a slot for custom content. The developer renders their own avatar, name, sign-out button. (Note: issue #1661 acceptance criterion "User section with avatar, name, sign-out" is satisfied by providing the `User` slot + documenting the pattern, not by building a pre-made widget.)
- **Content header/toolbar** — No `AppShell.Header` inside the content area. Developers add their own page headers.
- **Multi-sidebar layouts** — One sidebar on the left. No right sidebar, no dual sidebars.
- **Responsive mobile sidebar** — Deferred to a separate follow-up issue. This P3 extracts the static layout pattern first. Mobile responsiveness is a P2 enhancement that builds on top of the static component.

---

## Unknowns

### Resolved

1. **Should NavItem live in primitives or themed layer?**
   - **Resolution:** NavItem lives in the **themed layer** only. The primitive (`ui-primitives`) provides the structural layout slots. The themed component in `theme-shadcn` adds `AppShell.NavItem` as a convenience wrapper around `Link`. This follows the Alert pattern where the themed layer adds `variant` support that the primitive doesn't have. Note: `ui-primitives` does depend on `@vertz/ui` for `createContext`/`useContext`, but NavItem belongs in the themed layer because it's a convenience opinion (Link + icon + active styling), not a structural concern.

2. **Should NavItem use exact or prefix matching?**
   - **Resolution:** Default to `prefix` matching for NavItem. Sidebar nav items represent sections, not leaf pages. `/projects` should highlight when viewing `/projects/123`. An `exact` option is available for cases where the developer needs exact matching. This differs from Link's default (exact) intentionally.

### None remaining

---

## POC Results

No POC needed. The reference implementation (`examples/linear/src/components/auth-guard.tsx`) already proves the layout pattern works. This feature is extracting a proven pattern into a reusable component.

---

## Type Flow Map

This component has no complex generics. Type flow is straightforward:

```
AppShellClasses (interface)
  ↓ classes prop on ComposedAppShellRoot
  ↓ stored in AppShellContext via createContext<AppShellContextValue>(
      undefined, '@vertz/ui-primitives::AppShellContext'
    )
  ↓ read by each sub-component via useContext(AppShellContext)
  ↓ applied to DOM elements via class={cn(ctx?.classes?.slotName, className)}
```

```
AppShellNavItemProps.href (string)
  ↓ passed to Link component
  ↓ Link.className = classes.navItem (base styling)
  ↓ Link.activeClass = classes.navItemActive (active styling)
  ↓ NavItem implements prefix matching: pathname.startsWith(href) || pathname === href
  ↓ When active, NavItem also emits aria-current="page"
```

```
AppShellNavItemProps.icon (IconComponent | undefined)
  ↓ if present, rendered as: <span data-part="icon">{icon({ size: 16 })}</span>
  ↓ icon is called as a function (not JSX) since it comes from props
  ↓ wrapped in span for styling control
```

No dead generics. No generic type parameters at all — all types are concrete interfaces.

### Type verification

```tsx
// .test-d.ts — verify props flow correctly

// Positive: valid usage compiles
<AppShell><AppShell.Sidebar><AppShell.Brand>App</AppShell.Brand></AppShell.Sidebar></AppShell>;
<AppShell.NavItem href="/foo">Nav</AppShell.NavItem>;
<AppShell.NavItem href="/foo" icon={SomeIcon}>Nav</AppShell.NavItem>;
<AppShell.NavItem href="/foo" match="exact">Nav</AppShell.NavItem>;
<AppShell.NavItem href="/foo" match="prefix">Nav</AppShell.NavItem>;

// @ts-expect-error — NavItem requires href
<AppShell.NavItem>Nav</AppShell.NavItem>;

// @ts-expect-error — match only accepts 'exact' | 'prefix'
<AppShell.NavItem href="/foo" match="partial">Nav</AppShell.NavItem>;
```

---

## E2E Acceptance Test

```tsx
describe('Feature: AppShell layout component', () => {
  describe('Given an AppShell with Sidebar and Content', () => {
    describe('When rendered', () => {
      it('Then displays a sidebar aside element and a main content element side by side', () => {
        const el = (
          <AppShell>
            <AppShell.Sidebar>
              <AppShell.Brand>Test App</AppShell.Brand>
              <AppShell.Nav>
                <AppShell.NavItem href="/home">Home</AppShell.NavItem>
                <AppShell.NavItem href="/settings">Settings</AppShell.NavItem>
              </AppShell.Nav>
              <AppShell.User>
                <span>John</span>
              </AppShell.User>
            </AppShell.Sidebar>
            <AppShell.Content>
              <div>Page content</div>
            </AppShell.Content>
          </AppShell>
        );

        expect(el.querySelector('aside[data-part="sidebar"]')).toBeTruthy();
        expect(el.querySelector('main[data-part="content"]')).toBeTruthy();
        expect(el.querySelector('[data-part="brand"]')?.textContent).toContain('Test App');
        expect(el.querySelector('nav[data-part="nav"]')).toBeTruthy();
        expect(el.querySelector('[data-part="user"]')?.textContent).toContain('John');
      });
    });
  });

  describe('Given NavItems with prefix matching (default)', () => {
    describe('When the current route is a nested child of a NavItem href', () => {
      it('Then the parent NavItem is active and has aria-current="page"', () => {
        // Navigate to nested route
        router.navigate({ to: '/projects/abc-123' });

        const projectsItem = el.querySelector('a[href="/projects"]');
        const settingsItem = el.querySelector('a[href="/settings"]');

        // /projects NavItem is active because /projects/abc-123 starts with /projects
        expect(projectsItem?.getAttribute('aria-current')).toBe('page');
        expect(projectsItem?.getAttribute('data-active')).toBe('true');
        // /settings is not active
        expect(settingsItem?.getAttribute('aria-current')).toBeNull();
        expect(settingsItem?.getAttribute('data-active')).toBeNull();
      });
    });

    describe('When navigating to a different route', () => {
      it('Then the active state updates reactively', () => {
        router.navigate({ to: '/home' });
        expect(el.querySelector('a[href="/home"]')?.getAttribute('data-active')).toBe('true');
        expect(el.querySelector('a[href="/settings"]')?.getAttribute('data-active')).toBeNull();

        router.navigate({ to: '/settings' });
        expect(el.querySelector('a[href="/home"]')?.getAttribute('data-active')).toBeNull();
        expect(el.querySelector('a[href="/settings"]')?.getAttribute('data-active')).toBe('true');
      });
    });
  });

  describe('Given a NavItem with match="exact"', () => {
    describe('When on a nested route', () => {
      it('Then the NavItem is NOT active', () => {
        router.navigate({ to: '/projects/abc-123' });

        // With exact matching, /projects does NOT match /projects/abc-123
        const exactItem = el.querySelector('a[href="/projects"][data-match="exact"]');
        expect(exactItem?.getAttribute('data-active')).toBeNull();
      });
    });
  });

  describe('Given a NavItem with an icon prop', () => {
    describe('When rendered', () => {
      it('Then displays the icon alongside the label text', () => {
        const el = (
          <AppShell.NavItem href="/projects" icon={FolderIcon}>
            Projects
          </AppShell.NavItem>
        );

        expect(el.querySelector('[data-part="icon"]')).toBeTruthy();
        expect(el.textContent).toContain('Projects');
      });
    });
  });

  describe('Given dynamic content inside AppShell.Nav', () => {
    describe('When mixing NavItems with custom Link elements', () => {
      it('Then both render correctly inside the nav container', () => {
        const el = (
          <AppShell.Nav>
            <AppShell.NavItem href="/projects" icon={FolderIcon}>Projects</AppShell.NavItem>
            <Link href="/projects/abc">Project ABC</Link>
          </AppShell.Nav>
        );

        const nav = el.querySelector('nav');
        expect(nav?.querySelectorAll('a').length).toBe(2);
      });
    });
  });

  // Type-level tests
  describe('Type safety', () => {
    it('NavItem requires href prop', () => {
      // @ts-expect-error — href is required
      <AppShell.NavItem>Missing href</AppShell.NavItem>;
    });

    it('NavItem accepts optional icon and match props', () => {
      // Compiles — all valid
      <AppShell.NavItem href="/foo">No icon</AppShell.NavItem>;
      <AppShell.NavItem href="/foo" icon={SomeIcon}>With icon</AppShell.NavItem>;
      <AppShell.NavItem href="/foo" match="prefix">Prefix</AppShell.NavItem>;
      <AppShell.NavItem href="/foo" match="exact">Exact</AppShell.NavItem>;
    });

    it('NavItem rejects invalid match values', () => {
      // @ts-expect-error — match only accepts 'exact' | 'prefix'
      <AppShell.NavItem href="/foo" match="partial">Invalid</AppShell.NavItem>;
    });
  });
});
```

---

## Architecture

### Layer split

```
ui-primitives/src/app-shell/
├── app-shell-composed.tsx    — ComposedAppShell (Root, Sidebar, Brand, Nav, Content, User)
├── types.ts                  — AppShellClasses, AppShellClassKey, slot props
└── index.ts                  — barrel export

theme-shadcn/src/styles/
└── app-shell.ts              — createAppShell() style factory

theme-shadcn/src/components/primitives/
└── app-shell.tsx             — ThemedAppShell (adds NavItem wrapping Link from @vertz/ui)

ui/src/components/index.ts    — export AppShell from components barrel
```

### Why the split

- **Primitive layer** (`ui-primitives`): Owns the layout **structure** — flex container, aside, nav, main. Distributes CSS classes via Context. Does not include NavItem because NavItem is a **convenience opinion** (Link + icon + active styling), not structural layout.
- **Themed layer** (`theme-shadcn`): Owns **styling** (CSS class definitions) and **convenience components** (`NavItem`). This matches the Alert pattern where the themed layer adds `variant` support that the primitive doesn't have.
- **Export layer** (`ui/components`): Single import point — `import { AppShell } from '@vertz/ui/components'`.

### Context and HMR

The primitive creates an internal context with a manual stable ID for HMR:

```tsx
const AppShellContext = createContext<AppShellContextValue>(
  undefined,
  '@vertz/ui-primitives::AppShellContext',
);
```

This follows the pattern of `CardContext`, `SheetContext`, etc. — required because `ui-primitives` is pre-built and not processed by the dev server's stable ID injection plugin.

### Component registration

**`theme-shadcn/src/configure.ts`:**
```tsx
// Lazy style registration
defineLazyStyle('appShell', createAppShell);

// Component registration
lazyComp('AppShell', () => {
  const s = styles.appShell;
  const Styled = withStyles(ComposedAppShell, {
    root: s.root,
    sidebar: s.sidebar,
    brand: s.brand,
    nav: s.nav,
    content: s.content,
    user: s.user,
  });

  // ThemedNavItem wraps Link with navItem/navItemActive classes
  const ThemedNavItem = createThemedNavItem(s.navItem, s.navItemActive);

  return Object.assign(Styled, { NavItem: ThemedNavItem });
});
```

**`theme-shadcn` module augmentation:**
```tsx
declare module '@vertz/ui' {
  interface ThemeComponentMap {
    AppShell: typeof ThemedAppShell;
  }
}
```

**`ui/src/components/index.ts`:**
```tsx
export const AppShell = createCallableSuiteProxy('AppShell', [
  'Sidebar', 'Brand', 'Nav', 'NavItem', 'User', 'Content',
]);
```

### NavItem implementation (themed layer)

```tsx
function ThemedNavItem({ href, children, icon, match = 'prefix', className }: AppShellNavItemProps) {
  const ctx = useContext(AppShellContext);
  const isActive = match === 'prefix'
    ? () => window.location.pathname.startsWith(href)
    : () => window.location.pathname === href;

  return (
    <Link
      href={href}
      className={cn(ctx?.classes?.navItem, className)}
      activeClass={ctx?.classes?.navItemActive}
      data-part="nav-item"
      data-active={isActive() ? 'true' : undefined}
      data-match={match}
      aria-current={isActive() ? 'page' : undefined}
    >
      {icon && <span data-part="icon">{icon({ size: 16 })}</span>}
      {children}
    </Link>
  );
}
```

Note: For `prefix` matching, NavItem implements its own active check (via `pathname.startsWith(href)`) and uses `data-active` + `aria-current` attributes. The `activeClass` on Link handles `exact` matching. For `prefix` mode, the active class is applied via the reactive `data-active` attribute and CSS `[data-active="true"]` selector in the theme, OR by conditionally concatenating `navItemActive` into the className.

---

## Responsive Mobile Sidebar (Future Enhancement)

Responsive behavior is **out of scope** for this initial P3 implementation. The static sidebar layout ships first. A separate P2 issue will add:

- CSS media queries to hide sidebar on mobile
- Sheet primitive wrapping sidebar content on mobile viewports
- Hamburger toggle in the content area
- Auto-close Sheet on NavItem click

This is documented here for architectural awareness but will have its own design doc when prioritized.

---

## Implementation Phases

### Phase 1: Primitive + Theme (static layout)

Deliver the composable sub-component structure with themed styling. No responsive behavior.

- `ComposedAppShell` in `ui-primitives` with Context-based class distribution
- `createAppShell()` style factory in `theme-shadcn`
- `ThemedAppShell` with `NavItem` (Link wrapper) in `theme-shadcn`
- Component registration (`lazyComp`, `ThemeComponentMap` augmentation)
- Export from `@vertz/ui/components` via `createCallableSuiteProxy`
- Unit tests for all sub-components + type tests

### Phase 2: Validation — Linear clone refactor + docs

Refactor the reference implementation to validate the API works for a real app.

- Refactor `examples/linear/src/components/auth-guard.tsx` to use `AppShell`
- Validate that dynamic content (project list) works alongside NavItems
- Add documentation in `packages/mint-docs/`
- Changeset
