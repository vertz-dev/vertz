# Manual Stable IDs for @vertz/ui Internal Contexts

## Rule

Every `createContext()` call inside `packages/ui/src/` **must** include a manual `__stableId` string as the second argument:

```ts
export const RouterContext = createContext<Router>(undefined, '@vertz/ui::RouterContext');
```

Format: `'@vertz/ui::<ConstName>'`

## Why

The vtz HMR system re-evaluates modules on file change. When a module is re-evaluated, `createContext()` creates a new object — breaking identity-based Map lookups in `ContextScope`. The `__stableId` parameter lets the context registry return the existing object instead, preserving Provider/useContext identity across HMR cycles.

## Who needs this

**Only `@vertz/ui` framework-internal contexts.** These are pre-built and shipped in `dist/`, so the dev server plugin never processes them.

**Users don't need manual IDs.** The dev server plugin (`injectContextStableIds` in `@vertz/ui-server`) automatically injects stable IDs into user code at dev time. Any `createContext()` in a user's `.ts`/`.tsx` files gets a stable ID injected transparently.

## Current contexts with manual IDs

- `packages/ui/src/router/router-context.ts` — `RouterContext`
- `packages/ui/src/router/outlet.ts` — `OutletContext`
- `packages/ui/src/dialog/dialog-stack.ts` — `DialogStackContext`

## Checklist for adding a new context in @vertz/ui

1. Add `__stableId` as the second argument: `createContext<T>(defaultValue, '@vertz/ui::<Name>')`
2. Verify HMR works: edit a file in the example app, navigate, confirm no "must be called within Provider" error
