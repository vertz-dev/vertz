# Phase 1: Primitive + Theme (Static Layout)

## Context

AppShell is a composable sidebar + content layout component for SaaS apps (issue #1661). This phase delivers the full component stack: primitive in `ui-primitives`, theme styles in `theme-shadcn`, themed `NavItem` wrapper, and export from `@vertz/ui/components`.

Design doc: `plans/1661-appshell-layout.md`

## Tasks

### Task 1: Primitive types + composed component

**Files:** (5)
- `packages/ui-primitives/src/app-shell/types.ts` (new)
- `packages/ui-primitives/src/app-shell/app-shell-composed.tsx` (new)
- `packages/ui-primitives/src/app-shell/index.ts` (new)
- `packages/ui-primitives/src/app-shell/__tests__/app-shell-composed.test.tsx` (new)
- `packages/ui-primitives/src/index.ts` (modified — add AppShell exports)

**What to implement:**

Create the `ComposedAppShell` primitive following the exact `ComposedCard` pattern:

1. **`types.ts`** — Define interfaces:
   ```ts
   export interface AppShellClasses {
     root?: string;
     sidebar?: string;
     brand?: string;
     nav?: string;
     navItem?: string;
     navItemActive?: string;
     content?: string;
     user?: string;
   }
   export type AppShellClassKey = keyof AppShellClasses;
   ```

2. **`app-shell-composed.tsx`** — Compound component:
   - `AppShellContext` with `createContext<{ classes?: AppShellClasses }>(undefined, '@vertz/ui-primitives::AppShellContext')`
   - Sub-components: `Sidebar` (`<aside>`), `Brand` (`<div>`), `Nav` (`<nav>`), `Content` (`<main>`), `User` (`<div>`)
   - Each sub-component reads classes from context via `useContext(AppShellContext)`
   - Each sub-component emits `data-part` attribute
   - Root provides context with classes
   - Export as `ComposedAppShell` with `Object.assign` for sub-components (same pattern as ComposedCard)
   - Do NOT include NavItem — that's themed layer only

3. **`index.ts`** — Barrel: re-export types and `ComposedAppShell`

4. **Tests** — One behavior per test:
   - Root renders a div with `data-part="app-shell"`
   - Sidebar renders an `<aside>` with `data-part="sidebar"`
   - Brand renders a div with `data-part="brand"`
   - Nav renders a `<nav>` with `data-part="nav"`
   - Content renders a `<main>` with `data-part="content"`
   - User renders a div with `data-part="user"`
   - Classes from context are distributed to sub-components
   - Children are rendered inside each sub-component

5. **`src/index.ts`** — Add exports following the Card pattern:
   ```ts
   export type { AppShellClasses, AppShellClassKey, ComposedAppShellProps } from './app-shell/app-shell-composed';
   export { ComposedAppShell } from './app-shell/app-shell-composed';
   ```

**Acceptance criteria:**
- [ ] All 6 sub-components render correct HTML elements with data-part attributes
- [ ] Context distributes classes to all sub-components
- [ ] `className` prop merges with context classes via `cn()`
- [ ] ComposedAppShell has sub-component properties (Sidebar, Brand, Nav, Content, User)
- [ ] Barrel exports are complete
- [ ] Tests pass, typecheck clean, lint clean

---

### Task 2: Theme styles + themed NavItem component

**Files:** (4)
- `packages/theme-shadcn/src/styles/app-shell.ts` (new)
- `packages/theme-shadcn/src/components/primitives/app-shell.tsx` (new)
- `packages/theme-shadcn/src/styles/app-shell.test.ts` (new — verifies CSS output)
- `packages/theme-shadcn/src/components/primitives/__tests__/app-shell.test.tsx` (new)

**What to implement:**

1. **`styles/app-shell.ts`** — Style factory following the `createCard()` pattern:
   ```ts
   export function createAppShell(): CSSOutput<AppShellBlocks> { ... }
   ```
   Slots: `root`, `sidebar`, `brand`, `nav`, `navItem`, `navItemActive`, `content`, `user`
   
   Style tokens (based on reference `auth-guard.tsx`):
   - root: `['flex', 'min-h:screen', 'bg:background']`
   - sidebar: `['w:56', 'bg:card', 'border-r:1', 'border:border', 'p:4', 'flex', 'flex-col']`
   - brand: `['font:lg', 'font:bold', 'text:foreground', 'mb:6']`
   - nav: `['flex', 'flex-col', 'gap:1', 'mb:auto']` (mb:auto pushes User to bottom)
   - navItem: `['text:sm', 'text:muted-foreground', 'py:1.5', 'px:2', 'rounded:md', 'transition:colors', 'hover:text:foreground', 'hover:bg:accent']`
   - navItemActive: additional active styles (e.g., `['text:foreground', 'bg:accent']`)
   - content: `['flex-1']`
   - user: `['mt:auto', 'pt:4', 'border-t:1', 'border:border', 'flex', 'items:center', 'gap:2']`

2. **`components/primitives/app-shell.tsx`** — Themed component following the `sheet.tsx` pattern:
   - Define `AppShellStyleClasses` interface for all readonly style strings
   - Define `ThemedAppShellComponent` interface with all sub-components including NavItem
   - `createThemedAppShell(styles: AppShellStyleClasses): ThemedAppShellComponent` factory
   - Root wraps `ComposedAppShell` with `withStyles()`
   - `ThemedNavItem` wraps `Link` from `@vertz/ui`:
     - Accepts `{ href, children, icon, match, className }` props
     - Default `match: 'prefix'`
     - Reads `navItem`/`navItemActive` classes from context
     - Implements prefix matching: `window.location.pathname.startsWith(href)`
     - Emits `data-part="nav-item"`, `data-active`, `data-match`, `aria-current="page"`
     - Renders icon: `{icon && <span data-part="icon">{icon({ size: 16 })}</span>}`
   - Attach all sub-components via `Object.assign`

3. **Tests:**
   - Style factory returns all expected slot keys with non-empty strings
   - Style factory returns a `css` property
   - ThemedNavItem renders a Link element with correct data attributes
   - ThemedNavItem applies active state for prefix matching
   - ThemedNavItem applies active state for exact matching
   - ThemedNavItem renders icon when provided
   - ThemedNavItem omits icon span when not provided

**Acceptance criteria:**
- [ ] `createAppShell()` returns all 8 class slots + `css`
- [ ] ThemedAppShell wraps ComposedAppShell with styles
- [ ] NavItem uses Link for SPA navigation
- [ ] NavItem defaults to prefix matching
- [ ] NavItem emits aria-current="page" when active
- [ ] NavItem renders icon in `[data-part="icon"]` span
- [ ] Tests pass, typecheck clean, lint clean

---

### Task 3: Component registration + export

**Files:** (4)
- `packages/theme-shadcn/src/configure.ts` (modified — add `defineLazyStyle` + `lazyComp`)
- `packages/theme-shadcn/src/index.ts` (modified — add `ThemeComponentMap` augmentation)
- `packages/ui/src/components/index.ts` (modified — add `AppShell` proxy)
- `packages/ui/src/components/__tests__/app-shell.test-d.ts` (new — type tests)

**What to implement:**

1. **`configure.ts`** — Add registration:
   ```ts
   // Style registration (near other defineLazyStyle calls)
   defineLazyStyle('appShell', createAppShell);
   
   // Component registration (near other lazyComp calls)
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
     const NavItem = createThemedNavItem(s.navItem, s.navItemActive);
     return Object.assign(Styled, { NavItem });
   });
   ```
   Also add imports for `createAppShell`, `ComposedAppShell`, `createThemedNavItem`.
   Add `appShell` to `ThemeStyles` interface.

2. **`index.ts`** — Add module augmentation:
   ```ts
   declare module '@vertz/ui/components' {
     interface ThemeComponentMap {
       AppShell: ThemedAppShellComponent;
     }
   }
   ```

3. **`ui/src/components/index.ts`** — Add proxy:
   ```ts
   export const AppShell: ThemeComponentMap['AppShell'] = /* #__PURE__ */ createCallableSuiteProxy(
     'AppShell',
     ['Sidebar', 'Brand', 'Nav', 'NavItem', 'User', 'Content'],
   ) as ThemeComponentMap['AppShell'];
   ```

4. **Type tests** — `.test-d.ts`:
   - Valid usage compiles (AppShell with sub-components)
   - `@ts-expect-error` — NavItem without href
   - `@ts-expect-error` — NavItem with invalid match value
   - NavItem with icon compiles
   - NavItem with match="prefix" and match="exact" compile

**Acceptance criteria:**
- [ ] `import { AppShell } from '@vertz/ui/components'` works
- [ ] `AppShell.Sidebar`, `.Brand`, `.Nav`, `.NavItem`, `.User`, `.Content` all resolve
- [ ] Type tests pass for valid and invalid usage
- [ ] Full quality gates pass: `vtz test && vtz run typecheck && vtz run lint`
