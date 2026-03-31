# Component Docs — Move to Packages & Deploy to Cloudflare

> Move `sites/component-docs/` into `packages/component-docs/` and deploy to Cloudflare Workers at `components.vertz.dev`.

## Motivation

The interactive component documentation site (48 components) has been built and works locally, but has never been deployed. It currently lives in `sites/component-docs/`, which is a non-published, non-CI'd directory.

**Why move to `packages/`?** The landing page already lives at `packages/landing/` — deployable sites belong in `packages/`, not `sites/`. The remaining contents of `sites/` are legacy backups (`landing-backup-2026-02-24`, `landing-nextjs`, `landing-nextjs-vercel`). Moving component-docs to `packages/` is consistent with monorepo conventions and puts both deployed sites (`landing`, `component-docs`) in the same directory.

Every day the docs stay local-only, potential users and contributors can't discover what Vertz's component library offers. This is a quick infrastructure win with high visibility impact.

---

## API Surface

No new API. This is an infrastructure move + deployment configuration.

**What changes:**

```
# Before
sites/component-docs/   → local dev only, no deployment

# After
packages/component-docs/ → deployed to components.vertz.dev via Cloudflare Workers
```

**New files:**

```ts
// packages/component-docs/src/worker.ts — Cloudflare Worker entry
// Follows the exact same pattern as packages/landing/src/worker.ts:
// Cache API, deploy-versioned keys, SPA fallback, security headers

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 1. Check Worker-level cache (Cache API)
    // 2. Fetch from ASSETS binding
    // 3. SPA fallback for /components/:name routes
    // 4. Cache headers (immutable for hashed assets, short TTL for HTML)
    // 5. Security headers
  }
} satisfies ExportedHandler<Env>;
```

```toml
# packages/component-docs/wrangler.toml
name = "vertz-component-docs"
main = "src/worker.ts"
compatibility_date = "2025-01-01"
workers_dev = true  # Enables *.workers.dev URL for pre-DNS testing

[assets]
directory = "./dist/client"
not_found_handling = "single-page-application"
html_handling = "auto-trailing-slash"

[[routes]]
pattern = "components.vertz.dev"
custom_domain = true
```

```json
// package.json additions
{
  "scripts": {
    "deploy": "bun run build && bunx wrangler deploy --define DEPLOY_VERSION:\"'$(date +%s)'\"",
    "deploy:preview": "bun run build && bunx wrangler deploy --env preview"
  },
  "devDependencies": {
    "wrangler": "^4.78.0"
  }
}
```

---

## Manifesto Alignment

### Principle 6: "If you can't demo it, it's not done"

48 components documented with live previews but unreachable by the public. Deploying them makes every component demo-able and discoverable.

### Principle 7: "Performance is not optional"

Cloudflare Workers with Cache API, deploy-versioned cache keys, and SPA fallback — the same production-grade delivery as the landing page.

### Principle 3: "AI agents are first-class users"

Published at a known URL, component docs become discoverable by agents. The pages are interactive SPAs (not structured data), so direct machine-readability is limited — a future enhancement could add `llms.txt` or JSON API endpoints for true machine-readable component data.

---

## Non-Goals

1. **New component pages** — Not writing new docs, just deploying what exists.
2. **SSG pre-rendering** — The site uses client-side rendering with SSR hydration. Full SSG with `generateParams` for all 48 routes is a future optimization that would improve SEO and first-contentful-paint.
3. **CI/CD pipeline** — Auto-deploy on merge is a follow-up. This is manual `bun run deploy`.
4. **Content changes** — No MDX editing, no new examples, no prop data updates.
5. **Search or analytics** — Future features.
6. **Custom domain SSL setup** — Cloudflare handles this automatically for custom domains.
7. **Versioned docs / version picker** — No per-version documentation. The site reflects current `main` and is redeployed manually. Pre-v1, APIs change frequently.
8. **Cleaning up `sites/` directory** — The remaining legacy directories in `sites/` are not addressed in this work.
9. **SEO optimization** — No meta tags, structured data, or sitemaps beyond what the build produces by default.

---

## Unknowns

### 1. Vertz CLI build output compatibility with Cloudflare Workers static assets

**Status:** Low risk. The landing page already uses the same pattern (`dist/client/` as the assets directory). The Vertz CLI `build` command outputs to `dist/client/` with hashed JS/CSS files and an `index.html`. The Worker serves static assets via `env.ASSETS.fetch()` and falls back to `index.html` for SPA routes.

**Resolution:** Verify by building once and inspecting `dist/client/` structure. If the output differs from what `wrangler.toml`'s `[assets]` expects, adjust the wrangler config.

### 2. Custom domain DNS configuration

**Status:** Requires manual Cloudflare dashboard setup.

**Resolution:** Add a CNAME record for `components.vertz.dev` pointing to the Worker. Cloudflare handles SSL automatically. This is a one-time manual step, not automated in the deployment.

---

## POC Results

N/A — no novel technical risk. The landing page (`packages/landing/`) already proves the deployment pattern works. The component docs site already builds via `@vertz/cli build`.

---

## Type Flow Map

N/A — no new types, generics, or cross-package type threading. The Worker entry is a plain `ExportedHandler<Env>` with a minimal `Env` interface (`ASSETS: Fetcher`).

---

## E2E Acceptance Test

```ts
describe('Component docs Cloudflare deployment', () => {
  describe('Given the site is built and deployed', () => {
    describe('When navigating to components.vertz.dev', () => {
      it('then redirects to /overview', () => {});
      it('then the sidebar shows all 48 components grouped by category', () => {});
    });

    describe('When navigating to /components/button', () => {
      it('then SSR-rendered HTML includes the page title "Button"', () => {});
      it('then the page hydrates and becomes interactive', () => {});
      it('then live component previews render correctly', () => {});
    });

    describe('When navigating to a non-existent route like /foo', () => {
      it('then SPA fallback serves index.html', () => {});
      it('then the app shows "Page not found" fallback', () => {});
    });

    describe('When requesting a hashed asset (JS/CSS)', () => {
      it('then responds with Cache-Control: immutable', () => {});
    });

    describe('When requesting an HTML page', () => {
      it('then responds with short max-age + stale-while-revalidate', () => {});
      it('then includes security headers (X-Content-Type-Options, X-Frame-Options)', () => {});
    });
  });
});
```

---

## Implementation Plan

### Phase 1: Move directory + update workspace references

**Goal:** Move `sites/component-docs/` to `packages/component-docs/` and verify everything still works.

**Deliverables:**
- `git mv sites/component-docs packages/component-docs`
- Verify `bun install` resolves workspace dependencies correctly (root `workspaces` already includes `packages/*`)
- Verify `bun run dev` works from the new location
- Verify `bun run build` produces correct output in `packages/component-docs/dist/`
- Update any CI filter references in root `package.json`

**Acceptance criteria (manual verification — no committed tests for this phase):**
- `bun install` succeeds with workspace resolution intact
- `bun run dev` starts the dev server from `packages/component-docs/`
- `bun run build` produces `dist/client/index.html` and hashed JS/CSS in `dist/client/assets/`

### Phase 2: Add Cloudflare Worker + wrangler config

**Goal:** Add the Worker entry point and wrangler.toml for deployment.

**Deliverables:**
- `src/worker.ts` — Cloudflare Worker (following landing page pattern, minus Durable Objects, presence, Brotli pre-compression, and Early Hints — the build pipeline doesn't produce `.br` files and the component docs has different critical assets than the landing page)
- `wrangler.toml` — Worker config with SPA fallback, custom domain, `workers_dev = true`
- `deploy` and `deploy:preview` scripts in package.json
- Worker tests (cache key construction, SPA fallback logic, header injection)

**Acceptance criteria:**
```ts
describe('Given the Cloudflare Worker', () => {
  describe('When handling an HTML route request', () => {
    it('then uses deploy-versioned cache key', () => {});
    it('then sets Cache-Control with short max-age + stale-while-revalidate', () => {});
    it('then includes security headers', () => {});
  });
  describe('When handling a hashed asset request', () => {
    it('then uses raw URL as cache key', () => {});
    it('then sets Cache-Control: immutable', () => {});
  });
  describe('When handling a 404 for an HTML route', () => {
    it('then serves index.html as SPA fallback', () => {});
  });
});
```

### Phase 3: Deploy and verify

**Goal:** Deploy to Cloudflare and verify the site works at components.vertz.dev.

**Deliverables:**
- Successful `bun run deploy` execution
- DNS CNAME record for `components.vertz.dev` (manual Cloudflare dashboard step)
- Verification that all component pages load and hydrate
- (Follow-up, minimal) Update landing page to add link to components.vertz.dev
- (Follow-up, minimal) Update Mintlify `component-library.mdx` to link to components.vertz.dev

**Acceptance criteria:**
- Site loads at components.vertz.dev
- Navigation works across all 48 component pages
- Live component previews render and are interactive
- Theme toggle (dark/light) works
- Security headers present in responses

---

## Dependencies Between Phases

```
Phase 1 (Move directory)
  ↓
Phase 2 (Worker + wrangler)
  ↓
Phase 3 (Deploy + verify)
```

Strictly sequential — each phase builds on the previous.

---

## Risks

1. **Build output mismatch** — If `@vertz/cli build` produces output in a different structure than what the Worker expects. **Mitigation:** Inspect `dist/` after building before writing the Worker.

2. **DNS propagation delay** — Custom domain may take time to activate. **Mitigation:** Test with `wrangler dev` and the workers.dev URL first.

3. **Worker compatibility** — The component docs dev server uses `@vertz/ui-server` which is Bun-specific. The Worker doesn't run SSR — it just serves static assets. **No risk** since the Worker is a simple static file server, not an SSR runtime.

4. **Pre-v1 API expectations** — Public component docs may be perceived as stable API documentation. Since Vertz is pre-v1 with frequent breaking changes, early adopters may be frustrated when APIs change. **Mitigation:** This is a content concern to address in a follow-up (e.g., a "Pre-v1 — APIs may change" banner), not a blocker for deployment.
