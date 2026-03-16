# SSG in Route Definitions — Design Doc

**Issue:** #1187 | **Parent:** #1174 (Gap 3)

## Context

Pre-render infrastructure already exists:
- `prerender?: boolean` on `RouteConfig` / `CompiledRoute`
- `discoverRoutes()`, `filterPrerenderableRoutes()`, `prerenderRoutes()` in `@vertz/ui-server`
- Route pattern discovery via SSR context (`discoveredRoutes`)

What's missing: dynamic route SSG (`generateParams`) and build pipeline integration.

## API Surface

### 1. `generateParams` on route config (`@vertz/ui`)

```typescript
const routes = defineRoutes({
  // Static route — prerender as-is
  '/about': {
    component: () => AboutPage(),
    prerender: true,
  },
  // Dynamic route — generate params at build time
  '/blog/:slug': {
    component: () => BlogPost(),
    loader: async (ctx) => fetchPost(ctx.params.slug),
    generateParams: async () => [
      { slug: 'intro-to-vertz' },
      { slug: 'getting-started' },
    ],
  },
  // Opt out explicitly
  '/dashboard': {
    component: () => Dashboard(),
    prerender: false,
  },
});
```

Type addition:
```typescript
interface RouteConfig<TPath extends string = string, ...> {
  // existing fields...
  prerender?: boolean;
  /** Generate param combinations for pre-rendering dynamic routes at build time. */
  generateParams?: () =>
    | Array<Record<string, string>>
    | Promise<Array<Record<string, string>>>;
}
```

`generateParams` implicitly sets `prerender: true` for the generated paths.

### 2. `collectPrerenderPaths()` in `@vertz/ui-server`

```typescript
const paths = await collectPrerenderPaths(compiledRoutes);
// ['/about', '/blog/intro-to-vertz', '/blog/getting-started']
```

Walks the route tree, expands dynamic routes via `generateParams`, skips `prerender: false`.

### 3. Build pipeline integration (`@vertz/cli`)

`buildUI()` gains an SSG step after server build:
1. Import built server module
2. Discover routes (from module export or SSR discovery)
3. Collect prerender paths (with `generateParams` expansion)
4. Render each path via `prerenderRoutes()`
5. Write HTML files to `dist/client/<path>/index.html`

The SSR module gains an optional `routes` export:
```typescript
// app.tsx
export { routes } from './router';
export default function App() { ... }
```

## Manifesto Alignment

- **One way to do things**: `prerender: true` for static, `generateParams` for dynamic. No alternative APIs.
- **If it builds, it works**: `generateParams` type constrains return to `Record<string, string>[]`.
- **AI agents first-class**: Single field, discoverable via autocomplete.
- **Performance**: Zero compute for pre-rendered routes.

## Non-Goals

- ISR (incremental static regeneration) — future work (#713)
- Automatic param discovery from data sources — developer provides `generateParams`
- Partial pre-rendering (streaming) — full page SSG only

## Type Flow Map

```
RouteConfig.generateParams → defineRoutes() → CompiledRoute.generateParams
  → collectPrerenderPaths() → string[] → prerenderRoutes() → HTML files
```

## Implementation Plan

### Phase 1: `generateParams` route type + path expansion
- Add `generateParams` to `RouteConfig`, `RouteConfigLike`, `CompiledRoute`
- Pass through in `defineRoutes()`
- Add `collectPrerenderPaths()` to `@vertz/ui-server/prerender.ts`
- Tests for type propagation and path expansion

### Phase 2: Build pipeline integration
- Add optional `routes` to `SSRModule`
- Update `buildUI()` with SSG step
- Write pre-rendered HTML to `dist/client/<path>/index.html`
- Tests for build pipeline SSG
