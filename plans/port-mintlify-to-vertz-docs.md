# Port Mintlify Docs to Vertz Docs

## Overview

Migrate the existing Mintlify documentation site (`packages/mint-docs/`, 59 MDX pages) to the Vertz docs framework (`@vertz/docs`). The result is a self-hosted docs site built with Vertz's own tooling — dogfooding the docs framework we built.

## API Surface

**Config (vertz.config.ts):**

```ts
import { defineDocsConfig } from '@vertz/docs';

export default defineDocsConfig({
  name: 'Vertz',
  logo: { light: './public/logo/light.svg', dark: './public/logo/dark.svg' },
  favicon: './public/favicon.svg',
  theme: {
    colors: { primary: '#3b82f6' },
    appearance: 'system',
  },
  navbar: {
    // Mintlify's "anchors" maps to "links" (anchor → label rename)
    links: [
      { label: 'GitHub', href: 'https://github.com/vertz-dev/vertz', icon: 'github' },
    ],
    // Mintlify's navbar.primary maps to navbar.cta
    cta: { label: 'Get Started', href: '/quickstart' },
  },
  footer: {
    socials: {
      github: 'https://github.com/vertz-dev/vertz',
      x: 'https://x.com/veraborgesv',
    },
  },
  search: { enabled: true },
  sidebar: [
    {
      tab: 'Guides',
      groups: [
        {
          title: 'Getting Started',
          pages: ['index', 'quickstart', 'installation', 'conventions', 'philosophy', 'guides/llm-quick-reference'],
        },
        // ... all groups from docs.json mapped (extension-less paths)
      ],
    },
    {
      tab: 'API Reference',
      groups: [/* ... */],
    },
    {
      tab: 'Examples',
      groups: [/* ... */],
    },
  ],
  redirects: [
    { source: '/guides/getting-started', destination: '/quickstart' },
    { source: '/guides/ui/query', destination: '/guides/ui/data-fetching' },
    { source: '/guides/ui/primitives', destination: '/guides/ui/component-library' },
    { source: '/guides/ui/ui-primitives', destination: '/guides/ui/component-library' },
    { source: '/guides/ui/theme', destination: '/guides/ui/component-library' },
    { source: '/guides/components', destination: '/guides/ui/component-library' },
    { source: '/guides/ui/components-list', destination: '/guides/ui/component-library' },
    { source: '/vision', destination: '/philosophy' },
    { source: '/manifesto', destination: '/philosophy' },
  ],
  llm: { enabled: true },
});
```

**MDX pages:** Same `.mdx` files with identical component syntax. The only content change is updating icon names from Font Awesome to Lucide equivalents.

**Dev workflow:**

```bash
cd packages/site
bun run dev    # vertz docs dev → http://localhost:3001
bun run build  # vertz docs build → dist/
bun run check  # vertz docs check → validate config + links
```

## Manifesto Alignment

- **Types flow everywhere** — `defineDocsConfig()` provides full type inference, catching config mistakes at edit time
- **One way to do things** — docs are built with Vertz's own tooling, not a third-party service
- **Production-ready by default** — the docs framework includes SSG, LLM output, search out of the box
- **LLM-first** — the docs framework was designed for LLM consumption (`llms.txt`, `llms-full.txt`)

## Non-Goals

- Redesigning the docs content or information architecture — this is a 1:1 port
- Adding new docs pages — port existing content only
- Custom theming beyond what Mintlify had — match current look
- Deploying the new docs site — deployment (hosting, DNS cutover, CI integration) is a follow-up task
- Search parity verification — search is built into `@vertz/docs` via Pagefind; validating quality vs Mintlify search is a separate concern
- Analytics parity — Mintlify may have provided usage analytics; setting up equivalent analytics is a follow-up
- Sidebar tab switching UI — the current docs framework renders all sidebar groups flat without tab navigation; adding tab UI is a framework enhancement, not a migration task

## Unknowns

None — all originally identified unknowns have been resolved during the review process (see Framework Gaps below).

## Framework Gaps to Address in Phase 1

These are pre-existing `@vertz/docs` gaps that must be fixed before the migration can proceed:

### 1. Static Asset Handling

**Problem:** Neither the dev server nor the build pipeline handles static files (logos, favicon, images).
- Dev server only routes through `routeMap` — any request for `/favicon.svg` returns 404
- Build pipeline only writes HTML, LLM markdown, sitemap, and redirect pages — no asset copy
- `render-page-html.ts` doesn't emit `<link rel="icon">` for the configured favicon
- Header renders site name as text, not the configured logo

**Fix:**
- Add `public/` directory support to dev server (serve static files as fallback)
- Add asset copy step to build pipeline (copy `public/` → `dist/`)
- Render `<link rel="icon" href="...">` in HTML `<head>` when favicon is configured
- Render logo image in header when logo is configured

### 2. `lucide-static` Dependency

**Problem:** The `Icon` component uses `require('lucide-static')` but `lucide-static` is not in `@vertz/docs` dependencies. Icons silently fall back to plain text.

**Fix:** Add `lucide-static` to `@vertz/docs` dependencies.

### 3. Icon Prop on Card and Step

**Problem:** `<Card>` and `<Step>` don't support the `icon` prop. Mintlify MDX files use it ~28 times.

**Fix:** Wire up the existing `Icon()` component in Card and Step renderers.

## Icon Name Mapping (Font Awesome → Lucide)

The Mintlify MDX files use Font Awesome icon names. The Vertz docs framework uses Lucide icons. These must be translated during the port:

| Font Awesome Name | Lucide Equivalent | Used In |
|---|---|---|
| `database` | `database` | index.mdx (Step) |
| `shield-check` | `shield-check` | index.mdx (Step, Card) |
| `server` | `server` | index.mdx (Step), cloudflare.mdx |
| `desktop` | `monitor` | index.mdx (Step) |
| `arrows-left-right` | `arrow-left-right` | index.mdx (Card) |
| `microchip` | `cpu` | index.mdx (Card) |
| `route` | `route` | index.mdx (Card), quickstart.mdx |
| `rocket` | `rocket` | index.mdx, quickstart.mdx |
| `download` | `download` | index.mdx, quickstart.mdx |
| `puzzle-piece` | `puzzle` | quickstart.mdx, installation.mdx |
| `bolt` | `zap` | quickstart.mdx |
| `paintbrush` | `paintbrush` | installation.mdx |
| `file` | `file` | cloudflare.mdx |

Icon names will be updated in each MDX file during its porting phase. Any icons with no direct Lucide equivalent will be substituted with the closest match.

## Config Field Mapping Notes

| Mintlify (`docs.json`) | Vertz (`vertz.config.ts`) | Notes |
|---|---|---|
| `colors.primary` | `theme.colors.primary` | Direct map |
| `colors.dark`, `colors.light` | *(dropped)* | Vertz uses CSS variables; these Mintlify color variants have no config target. Acceptable — the primary color + CSS var dark mode handles this. |
| `navbar.primary` | `navbar.cta` | Rename: `label`/`href` are the same |
| `navigation.global.anchors[].anchor` | `navbar.links[].label` | Rename: `anchor` → `label` |
| `navigation.tabs` | `sidebar` | Same structure: `tab` + `groups` + `pages` |
| `theme: "mint"` | *(dropped)* | Mintlify-specific theme name; Vertz uses its own CSS variable system |
| `llmsTxt.enabled` | `llm.enabled` | Rename |

## Known Limitations (Post-Migration Follow-ups)

1. **Sidebar renders flat** — all tab groups appear in one sidebar without tab-switching UI. The content is all navigable, but the UX differs from Mintlify's tabbed navigation. Framework enhancement tracked separately.
2. **Dev server doesn't handle redirects** — redirects only work in the static build (via `<meta http-equiv="refresh">`). During dev, navigating to a redirect source returns 404.
3. **Prev/next navigation crosses tab boundaries** — the last page of "Guides" links to the first page of "API Reference." Framework enhancement tracked separately.

## Deployment (Deferred)

Deployment is explicitly deferred to a follow-up task. Key items for that task:
- **Hosting:** Static build output (`dist/`) is Cloudflare Pages-compatible
- **DNS cutover:** Current Mintlify docs domain must not change until the new site is validated
- **CI integration:** Add `vertz docs check` to CI pipeline; add `vertz docs build` to the build matrix
- **`packages/mint-docs/` removal:** Only after the new site is deployed and validated in production

## Type Flow Map

No new generic types — this is a content migration, not a framework feature.

## E2E Acceptance Test

```bash
# Dev server starts and renders the homepage
cd packages/site && vertz docs dev
# → http://localhost:3001 renders the Vertz docs homepage with logo and favicon

# All pages are accessible via sidebar navigation
# → All pages render without errors

# Static build succeeds
vertz docs build
# → dist/ contains all HTML pages
# → dist/llms.txt exists
# → dist/llms-full.txt exists
# → Static assets (favicon, logos) are in dist/

# Validation passes
vertz docs check
# → 0 errors, 0 warnings
```

---

## Implementation Plan

### Phase 1: Framework Enhancements

**Goal:** Fix the 3 framework gaps in `@vertz/docs` that block the migration: static asset handling, `lucide-static` dependency, and Card/Step icon props.

**Changes:**

1. **Add `lucide-static` to `@vertz/docs` dependencies** (`packages/docs/package.json`)

2. **Add `icon` prop to `<Card>` component** (`packages/docs/src/components/card.ts`)
   - Accept optional `icon` string prop
   - Render a Lucide icon inline before the title using the existing `Icon()` function

3. **Add `icon` prop to `<Step>` component** (`packages/docs/src/components/steps.ts`)
   - Accept optional `icon` string prop
   - Render icon in the step marker area when provided

4. **Add static file serving to dev server** (`packages/docs/src/dev/docs-dev-server.ts`)
   - Before returning 404, check if the requested path exists in `public/` directory
   - Serve the file with appropriate content-type

5. **Add asset copy to build pipeline** (`packages/docs/src/generator/build-pipeline.ts`)
   - After generating HTML pages, copy `public/` → `dist/` recursively

6. **Render favicon in HTML `<head>`** (`packages/docs/src/dev/render-page-html.ts`)
   - When `config.favicon` is set, emit `<link rel="icon" href="...">`

7. **Render logo in header** (`packages/docs/src/dev/render-page-html.ts`)
   - When `config.logo` is set, render `<img>` instead of plain text site name

**Acceptance Criteria:**

```typescript
describe('Feature: Card icon prop', () => {
  describe('Given a Card with icon="rocket"', () => {
    describe('When rendered', () => {
      it('Then outputs an icon element before the title', () => {});
    });
  });
  describe('Given a Card without icon', () => {
    describe('When rendered', () => {
      it('Then renders title without icon (no regression)', () => {});
    });
  });
});

describe('Feature: Step icon prop', () => {
  describe('Given a Step with icon="database"', () => {
    describe('When rendered', () => {
      it('Then outputs an icon element in the step marker', () => {});
    });
  });
});

describe('Feature: Static file serving in dev', () => {
  describe('Given a file at public/favicon.svg', () => {
    describe('When requesting /favicon.svg from dev server', () => {
      it('Then serves the file with correct content-type', () => {});
    });
  });
});

describe('Feature: Favicon in HTML head', () => {
  describe('Given config.favicon is set', () => {
    describe('When rendering a page', () => {
      it('Then HTML contains <link rel="icon" href="...">', () => {});
    });
  });
});

describe('Feature: Logo in header', () => {
  describe('Given config.logo is set', () => {
    describe('When rendering a page', () => {
      it('Then header contains an img tag with the logo src', () => {});
    });
  });
});

describe('Feature: Asset copy in build', () => {
  describe('Given a public/ directory with files', () => {
    describe('When running buildDocs()', () => {
      it('Then copies public/ files to dist/', () => {});
    });
  });
});
```

### Phase 2: Site Setup + Getting Started Pages (6 pages)

**Goal:** Create the docs site package and port the highest-traffic pages.

**Changes:**

1. **Create `packages/site/` package:**
   - `package.json` (private, `@vertz/site`)
   - `vertz.config.ts` with full config (all 9 redirects, all sidebar groups matching `docs.json` structure exactly)
   - `public/` directory with logos and favicon copied from `mint-docs/`
   - Scripts: `"dev": "vertz docs dev"`, `"build": "vertz docs build"`, `"check": "vertz docs check"`

2. **Port Getting Started pages** (copy from `mint-docs/` to `pages/`):
   - `index.mdx` — update icon names (FA → Lucide)
   - `quickstart.mdx` — update icon names
   - `installation.mdx` — update icon names
   - `conventions.mdx`
   - `philosophy.mdx`
   - `guides/llm-quick-reference.mdx`

**Acceptance Criteria:**
- All 6 pages render without errors in dev server
- `vertz docs check` passes with 0 errors
- Internal links between Getting Started pages resolve correctly
- Favicon appears in browser tab
- Logo appears in header

### Phase 3: Port UI Guide Pages (14 pages)

**Goal:** Port all `guides/ui/*` pages plus the compiler page.

**Pages:**
- `guides/ui/overview.mdx`
- `guides/ui/components.mdx`
- `guides/ui/component-library.mdx`
- `guides/ui/reactivity.mdx`
- `guides/ui/styling.mdx`
- `guides/ui/routing.mdx`
- `guides/ui/data-fetching.mdx`
- `guides/ui/auto-field-selection.mdx`
- `guides/ui/forms.mdx`
- `guides/ui/auth.mdx`
- `guides/ui/multi-tenancy.mdx`
- `guides/ui/ssr.mdx`
- `guides/ui/access-control.mdx`
- `guides/ui/compiler.mdx`

Sidebar config preserves the separate group headings from `docs.json`: "vertz/ui" (13 pages) and "vertz/ui-compiler" (1 page).

**Acceptance Criteria:**
- All 14 pages render without errors
- `vertz docs check` passes with 0 errors
- Cross-links between UI guide pages resolve

### Phase 4: Port Server, DB, Schema, Errors, Fetch, Icons Pages (18 pages)

**Goal:** Port all remaining guide pages.

**Pages:**
- `guides/server/overview.mdx` through `guides/server/services.mdx` (9 pages)
- `guides/db/overview.mdx` through `guides/db/seeding.mdx` (6 pages)
- `guides/schema.mdx`
- `guides/errors.mdx`
- `guides/fetch.mdx`
- `guides/ui/icons.mdx`
- `guides/env.mdx` (under "vertz/server" group per `docs.json`)

**Acceptance Criteria:**
- All 18 pages render without errors
- `vertz docs check` passes with 0 errors

### Phase 5: Port Deploy, Testing, API Reference, Examples (18 pages)

**Goal:** Port all remaining pages — deployment guides, testing, API reference, and examples.

**Pages:**
- `guides/deploy/cloudflare.mdx` through `guides/deploy/og-images.mdx` (5 pages)
- `guides/testing.mdx`, `guides/testing-server.mdx` (2 pages)
- `api-reference/fetch/sdk.mdx` (1 page)
- `api-reference/ui/*.mdx` (10 pages)
- `examples/task-manager.mdx` (1 page)

**Acceptance Criteria:**
- All pages render without errors
- `vertz docs check` passes with 0 errors for the entire site
- `vertz docs build` produces a complete static site
- All 9 redirects generate redirect HTML pages
- LLM output files are generated (`llms.txt`, `llms-full.txt`)

### Phase 6: Final Validation + Cleanup

**Goal:** Full end-to-end validation, changeset, cleanup.

1. Run `vertz docs build` — verify all pages build
2. Run `vertz docs check` — 0 errors, 0 warnings
3. Spot-check rendered pages for formatting issues
4. Mark `packages/mint-docs/` as deprecated in `package.json` (keep for reference until new site is deployed)
5. Add changeset for `@vertz/docs` (Phase 1 framework enhancements)

**Acceptance Criteria:**
- Full static build succeeds
- `vertz docs check` reports 0 errors
- Dev server starts and all pages are navigable
- LLM output covers all pages
- Changeset added
