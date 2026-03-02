# POC: SSR + HMR + API in a Single Bun Server

## Question

Does Bun serve HMR-transformed client bundles for `<script>` tags that appear
in dynamically generated HTML from the `fetch` handler (SSR)?

## Answer: YES ✅

**Outcome A confirmed.** SSR + HMR + API all work in a single `Bun.serve()` call.

## Technique

1. **Hidden HTML route** — `'/__hmr': hmrShell` where `hmrShell` is an HTML
   import that references the client entry. This makes Bun initialize HMR and
   bundle the client module graph.

2. **Discover bundled URL** — After server starts, self-fetch `/__hmr` and
   extract the `/_bun/client/<hash>.js` URL from the rendered HTML.

3. **SSR references the same bundle** — The `fetch` handler generates HTML with
   `<script src="/_bun/client/<hash>.js">` plus the HMR bootstrap snippet
   (`data-bun-dev-server-script` attribute + unref beacon).

4. **HMR works seamlessly** — The browser loads the same bundle Bun tracks,
   so `import.meta.hot` is available and file edits trigger hot updates.

## Test Results (Playwright, headless)

| Test                        | Result |
|-----------------------------|--------|
| SSR page loads              | ✅     |
| `import.meta.hot` active    | ✅     |
| HMR hot update on file edit | ✅     |
| No full page reload         | ✅     |

## Run

```bash
bun run poc/ssr-hmr/server.ts
```

Endpoints:
- `http://localhost:3456/` — SSR page (fetch handler)
- `http://localhost:3456/__hmr` — HMR shell (routes, initializes HMR)
- `http://localhost:3456/api/health` — API route (fetch handler)

## Key Insights

- `HTMLBundle` is opaque at import time — Bun transforms it at response time.
  You cannot extract the bundled URL from the imported object. Instead,
  self-fetch the route after `Bun.serve()` starts to get the rendered HTML.

- The `fetch` handler must NOT intercept `/_bun/*` or `.tsx`/`.js` requests —
  those need to reach Bun's internal asset server. Only match page routes.

- The `data-bun-dev-server-script` attribute on the `<script>` tag and the
  unref beacon `<script>` are both needed for proper HMR lifecycle management.

## Implications for vertz dev server

This validates the **single-server architecture** for `vertz dev`:

```
Bun.serve({
  routes: {
    '/__vertz_hmr': clientHmrShell,  // Hidden: initializes HMR
  },
  fetch(req) {
    if (isApiRoute(req)) return handleApi(req);
    return ssrRender(req);           // SSR with /_bun/ script refs
  },
  development: { hmr: true },
});
```

No need for two servers or a separate asset pipeline. SSR, HMR, and API
all coexist in one `Bun.serve()`.
