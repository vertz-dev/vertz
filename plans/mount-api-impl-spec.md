# Implementation Spec: mount() + renderToHTML() API

> Design doc: `plans/mount-api-design.md`
> Branch: `feat/mount-api`

## Overview

Implements a simplified client-side `mount()` API that handles theme/styles injection, root resolution, and fresh mounting. Also implements server-side `renderToHTML()` wrapper around existing `renderPage()`.

**v0.1 scope:** `'replace'` mode (fresh mount) and `false` mode (no SSR expected). Tolerant/strict hydration deferred to v0.2.

---

## Phases

### Phase 1: `mount()` Client-Side
**Scope:** Create mount() function with style injection, root resolution, and fresh mount. No hydration for v0.1.
**Estimated complexity:** Medium (~10min per sub-task)

#### Sub-task 1.1: Create mount types + basic function signature
- **Files to create:** `packages/ui/src/mount.ts`
- **What to do:**
  - Define `MountOptions` interface:
    ```ts
    interface MountOptions {
      /** Theme definition for CSS vars */
      theme?: Theme;
      /** Global CSS strings to inject */
      styles?: string[];
      /** Hydration mode: 'replace' (default) or false */
      hydration?: 'replace' | false;
      /** Component registry for per-component hydration */
      registry?: ComponentRegistry;
      /** Callback after mount completes */
      onMount?: (root: HTMLElement) => void;
    }
    ```
  - Define `MountHandle` interface:
    ```ts
    interface MountHandle {
      /** Unmount the app and cleanup */
      unmount: () => void;
      /** Root HTMLElement */
      root: HTMLElement;
    }
    ```
  - Create `mount()` function signature:
    ```ts
    function mount<AppFn extends () => HTMLElement>(
      app: AppFn,
      selector: string | HTMLElement,
      options?: MountOptions
    ): MountHandle
    ```
  - Export types from `packages/ui/src/mount.ts`
- **Verification:** `pnpm turbo typecheck --filter=@vertz/ui`
- **Commit message:** `feat(ui): add mount types and function signature`
- **Dependencies:** None

#### Sub-task 1.2: Style injection integration
- **Files to modify:** `packages/ui/src/mount.ts`
- **What to do:**
  - Import `compileTheme` from `./css/theme` and `injectCSS` from `./css/css`
  - At the start of mount(), before any DOM work:
    ```ts
    // Inject theme CSS
    if (options.theme) {
      const { css } = compileTheme(options.theme);
      injectCSS(css);
    }
    // Inject global styles
    for (const css of options.styles ?? []) {
      injectCSS(css);
    }
    ```
- **Verification:** `pnpm turbo test --filter=@vertz/ui -- --testPathPattern="mount"`
- **Commit message:** `feat(ui): integrate compileTheme and injectCSS in mount()`
- **Dependencies:** Sub-task 1.1 must complete first

#### Sub-task 1.3: Root resolution + fresh mount
- **Files to modify:** `packages/ui/src/mount.ts`
- **What to do:**
  - Implement root resolution:
    ```ts
    const root = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;

    if (!root) {
      throw new Error(`mount(): root element "${selector}" not found`);
    }
    ```
  - Implement fresh mount logic (for `'replace'` mode or when no SSR detected):
    ```ts
    // Clear existing content
    root.textContent = '';

    // Create and append the app
    const app = app();
    root.appendChild(app);

    // Call onMount callback
    options.onMount?.(root);
    ```
- **Verification:** `pnpm turbo test --filter=@vertz/ui -- --testPathPattern="mount"`
- **Commit message:** `feat(ui): add root resolution and fresh mount logic`
- **Dependencies:** Sub-task 1.2 must complete first

#### Sub-task 1.4: Unmount + return handle
- **Files to modify:** `packages/ui/src/mount.ts`
- **What to do:**
  - Implement unmount function that clears root:
    ```ts
    return {
      unmount: () => {
        root.textContent = '';
      },
      root,
    };
    ```
  - Note: Do NOT remove injected styles (they're globally deduplicated)
- **Verification:** `pnpm turbo test --filter=@vertz/ui -- --testPathPattern="mount"`
- **Commit message:** `feat(ui): add unmount cleanup to mount handle`
- **Dependencies:** Sub-task 1.3 must complete first

#### Sub-task 1.5: Error handling (root not found, invalid selector)
- **Files to modify:** `packages/ui/src/mount.ts`
- **What to do:**
  - Add validation at start of mount():
    ```ts
    if (typeof selector !== 'string' && !(selector instanceof HTMLElement)) {
      throw new Error(`mount(): selector must be a string or HTMLElement, got ${typeof selector}`);
    }
    ```
  - Ensure error message for root not found includes the selector value
- **Verification:** `pnpm turbo test --filter=@vertz/ui -- --testPathPattern="mount"`
- **Commit message:** `feat(ui): add error handling for invalid selector`
- **Dependencies:** Sub-task 1.4 must complete first

#### Sub-task 1.6: Export from index.ts
- **Files to modify:** `packages/ui/src/index.ts`
- **What to do:**
  - Add export for mount:
    ```ts
    export { mount } from './mount';
    export type { MountOptions, MountHandle } from './mount';
    ```
- **Verification:** `pnpm turbo typecheck --filter=@vertz/ui`
- **Commit message:** `feat(ui): export mount from package index`
- **Dependencies:** Sub-task 1.5 must complete first

#### Phase 1 Tests
- Test mount with no options (hello world case)
- Test mount with theme injection
- Test mount with global styles injection
- Test mount with invalid selector throws error
- Test mount with non-existent root throws error
- Test unmount clears root content
- Test mount accepts HTMLElement directly

#### Phase 1 Definition of Done
- [ ] All sub-task commits landed
- [ ] All phase tests pass
- [ ] Typecheck + lint green
- [ ] No regressions in existing tests

---

### Phase 2: `renderToHTML()` Server-Side
**Scope:** Wrap existing renderPage() with simpler API for theme/styles compilation.
**Estimated complexity:** Medium (~10min per sub-task)

#### Sub-task 2.1: Create renderToHTML types
- **Files to create:** `packages/ui-server/src/render-to-html.ts`
- **What to do:**
  - Define `RenderToHTMLOptions` interface:
    ```ts
    interface RenderToHTMLOptions<AppFn extends () => VNode> {
      /** The app component function */
      app: AppFn;
      /** Request URL for SSR */
      url: string;
      /** Theme definition for CSS vars */
      theme?: Theme;
      /** Global CSS strings to inject */
      styles?: string[];
      /** HTML head configuration */
      head?: {
        title?: string;
        meta?: Array<{ name?: string; property?: string; content: string }>;
        links?: Array<{ rel: string; href: string }>;
      };
      /** Container selector (default '#app') */
      container?: string;
    }
    ```
  - Define return type as `Promise<string>`
- **Verification:** `pnpm turbo typecheck --filter=@vertz/ui-server`
- **Commit message:** `feat(ui-server): add renderToHTML types`
- **Dependencies:** None (independent of Phase 1)

#### Sub-task 2.2: Wire to existing renderPage, extract HTML
- **Files to modify:** `packages/ui-server/src/render-to-html.ts`
- **What to do:**
  - Import `renderPage` from `./render-page`, `compileTheme` from `@vertz/ui`, `installDomShim` from `./dom-shim`
  - Implement renderToHTML function:
    ```ts
    export async function renderToHTML<AppFn extends () => VNode>(
      app: AppFn,
      options: RenderToHTMLOptions<AppFn>
    ): Promise<string> {
      // Install DOM shim for SSR
      installDomShim();
      globalThis.__SSR_URL__ = options.url;

      try {
        // Compile theme and styles
        const themeCss = options.theme ? compileTheme(options.theme).css : '';
        const allStyles = [themeCss, ...options.styles ?? []].filter(Boolean);

        // Build head config for renderPage
        const headEntries: string[] = [];
        for (const style of allStyles) {
          headEntries.push(`<style>${style}</style>`);
        }

        // Build meta tags
        const metaHtml = options.head?.meta?.map(
          m => `<meta ${m.name ? `name="${m.name}"` : `property="${m.property}"`} content="${m.content}">`
        ).join('\n') ?? '';

        // Call renderPage
        const response = renderPage(app(), {
          title: options.head?.title,
          head: metaHtml + '\n' + headEntries.join('\n'),
        });

        // Extract HTML from Response
        return await response.text();
      } finally {
        // Cleanup
        delete globalThis.__SSR_URL__;
      }
    }
    ```
  - Note: You'll need to check if `installDomShim` exists, if not create it
- **Verification:** `pnpm turbo test --filter=@vertz/ui-server -- --testPathPattern="renderToHTML"`
- **Commit message:** `feat(ui-server): wire renderToHTML to renderPage`
- **Dependencies:** Sub-task 2.1 must complete first

#### Sub-task 2.3: Handle __SSR_URL__ dependency
- **Files to check/modify:** Look for existing dom-shim or create one
- **What to do:**
  - Check if `packages/ui-server/src/dom-shim.ts` exists
  - If not, create it with installDomShim function that sets up minimal globals
  - Ensure `__SSR_URL__` global is properly handled
- **Verification:** `pnpm turbo test --filter=@vertz/ui-server -- --testPathPattern="renderToHTML"`
- **Commit message:** `fix(ui-server): ensure dom-shim sets __SSR_URL__ global`
- **Dependencies:** Sub-task 2.2 must complete first

#### Sub-task 2.4: Export from ui-server index.ts
- **Files to modify:** `packages/ui-server/src/index.ts`
- **What to do:**
  - Add export:
    ```ts
    export { renderToHTML } from './render-to-html';
    export type { RenderToHTMLOptions } from './render-to-html';
    ```
- **Verification:** `pnpm turbo typecheck --filter=@vertz/ui-server`
- **Commit message:** `feat(ui-server): export renderToHTML from package`
- **Dependencies:** Sub-task 2.3 must complete first

#### Phase 2 Tests
- Test renderToHTML returns HTML string
- Test theme CSS is injected in head
- Test global styles are injected in head
- Test meta tags are rendered
- Test title is rendered

#### Phase 2 Definition of Done
- [ ] All sub-task commits landed
- [ ] All phase tests pass
- [ ] Typecheck + lint green
- [ ] No regressions in existing tests

---

### Phase 3: Demo Migration
**Scope:** Update entity-todo and task-manager demo apps to use mount() and renderToHTML()
**Estimated complexity:** Small (~5min per sub-task)

#### Sub-task 3.1: Migrate entity-todo to use mount()
- **Files to modify:** Find entity-todo app entry point (likely in `apps/entity-todo/src/main.ts` or similar)
- **What to do:**
  - Replace existing manual mount boilerplate (~30 lines) with:
    ```ts
    import { mount } from '@vertz/ui'
    import { App } from './app'
    import { theme } from './styles/theme'
    import { globalStyles } from './styles/global'

    mount(App, '#app', {
      theme,
      styles: [globalStyles.css],
    })
    ```
  - Remove duplicate `buildThemeCss` function if present
- **Verification:** Run entity-todo app and verify it mounts correctly
- **Commit message:** `feat(entity-todo): migrate to mount() API`
- **Dependencies:** Phase 1 Sub-task 1.6 must complete first

#### Sub-task 3.2: Migrate task-manager to use mount()
- **Files to modify:** Find task-manager app entry point
- **What to do:**
  - Same as 3.1 for task-manager app
- **Verification:** Run task-manager app and verify it mounts correctly
- **Commit message:** `feat(task-manager): migrate to mount() API`
- **Dependencies:** Sub-task 3.1 can run in parallel (independent demos)

#### Sub-task 3.3: Verify both apps work
- **What to do:**
  - Run both demo applications
  - Verify no console errors
  - Verify styles/theme are applied correctly
  - Verify apps render properly
- **Verification:** Manual browser verification or E2E tests
- **Commit message:** `chore(demos): verify mount() migration works`
- **Dependencies:** Sub-tasks 3.1 and 3.2 must complete first

#### Phase 3 Tests
- Manual verification that both demos work identically to before
- No additional unit tests needed (migration verification)

#### Phase 3 Definition of Done
- [ ] Both demo apps use mount()
- [ ] Both demo apps work without regression
- [ ] Boilerplate reduced from ~30 lines to ~4 lines

---

## Shared Config Type

For future use (v0.2+), this type can be extracted to a shared location:

```ts
interface AppConfig {
  theme?: Theme;
  styles?: string[];
}
```

---

## Implementation Notes

### Error Messages

| Scenario | Error Message |
|----------|----------------|
| Invalid selector type | `mount(): selector must be a string or HTMLElement, got ${type}` |
| Root element not found | `mount(): root element "${selector}" not found` |
| Theme compilation failure | Let it throw from compileTheme (not our responsibility) |

### Hydration (NOT in v0.1)

The following are deferred to v0.2:
- `'tolerant'` mode - scoped diff with browser extension tolerance
- `'strict'` mode - standard hydration with mismatch errors
- SSR content detection via hydration markers

### Style Deduplication

- `injectCSS()` already handles deduplication via `injectedCSS` Set
- `unmount()` does NOT remove styles (shared globally)
- This is intentional - multiple components may share theme

---

## Rules

- Each sub-task should be completable by an agent in **under 10 minutes**
- Sub-tasks with no dependencies can run **in parallel**
- Each sub-task has its own **verification step**
- TDD: write tests first where applicable
