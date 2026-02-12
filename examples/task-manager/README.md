# Task Manager — @vertz/ui Demo App

A realistic task management app demonstrating every major feature of `@vertz/ui` v0.1. This is a code-only demo (no build tooling wired up yet) — the TypeScript is intended to be correct and representative of how a developer would use the framework.

## What This Exercises

| Feature | Where |
|---------|-------|
| `signal`, `computed`, `effect` | Task list filtering, form state, theme switching |
| `ref`, `onMount`, `onCleanup` | Task card DOM access, page lifecycle |
| `watch` | Settings page theme change observer |
| `createContext`, `useContext` | App-wide settings (theme, default priority) |
| `css()`, `variants()` | All component styles, button/badge variants |
| `defineTheme()`, `ThemeProvider` | Light/dark theme with contextual tokens |
| `form()` with validation | Create task form with field-level errors |
| `query()` | Task list + task detail data fetching |
| `defineRoutes`, `createRouter` | 4-page routing with params and loaders |
| `createLink` | Sidebar navigation with active state |
| `createOutlet` | Outlet context setup (for nested layout demo) |
| `Dialog` from `@vertz/primitives` | Delete confirmation with focus trap |
| `Tabs` from `@vertz/primitives` | Task detail Details/Activity tabs |
| `@vertz/ui/test` | `renderTest`, `findByText`, `click`, `waitFor`, `createTestRouter` |

## Project Structure

```
src/
├── api/
│   └── mock-data.ts        # In-memory CRUD with SDK method simulation
├── components/
│   ├── confirm-dialog.ts    # Dialog primitive wrapper
│   ├── task-card.ts         # Task list card component
│   └── task-form.ts         # Create task form with validation
├── lib/
│   ├── settings-context.ts  # App settings via createContext
│   └── types.ts             # Domain types
├── pages/
│   ├── create-task.ts       # Create task page
│   ├── settings.ts          # Theme switching settings page
│   ├── task-detail.ts       # Single task view with tabs
│   └── task-list.ts         # Task list with filtering
├── styles/
│   ├── components.ts        # Shared css() and variants() styles
│   └── theme.ts             # defineTheme() configuration
├── tests/
│   ├── confirm-dialog.test.ts
│   ├── router.test.ts
│   ├── task-form.test.ts
│   └── task-list.test.ts
├── app.ts                   # Root app shell
├── index.ts                 # Entry point
└── router.ts                # Route definitions
```

## Setup

```bash
# From the monorepo root
bun install

# Run typecheck (once build tooling is available)
bun run --filter @vertz-examples/task-manager typecheck

# Run tests (once DOM environment is configured)
bun test examples/task-manager/
```

## Architecture Notes

- **No JSX** — All DOM construction is explicit `document.createElement` calls. This is intentional: `@vertz/ui` v0.1 doesn't include a JSX transform yet. The compiler will handle this in the future.
- **Mock API** — The `api/mock-data.ts` file simulates what `@vertz/codegen` SDK methods would look like. The `taskApi` object attaches `.url` and `.method` metadata just like generated SDK methods.
- **Theme** — Uses contextual tokens (with `_dark` suffix) so colors swap automatically when `data-theme` changes. No runtime token resolution needed.
- **Context** — `SettingsContext` uses the scope-based Provider pattern (callback-style, not component-style). This matches the @vertz/ui context API.

## DX Journal

See [DX_JOURNAL.md](./DX_JOURNAL.md) for a detailed account of every friction point, gotcha, and win encountered while building this demo. This is a DX audit — it's the most important output of this exercise.
