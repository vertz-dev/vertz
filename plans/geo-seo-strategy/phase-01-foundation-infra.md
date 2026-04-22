# Phase 1: Foundation Infrastructure

## Context

Everything in this plan depends on Vertz being discoverable, measurable, and parseable by LLMs. This phase ships the foundation that makes Phase 2 (content) and Phase 3 (distribution) meaningful. Without it, posts are invisible and we cannot tell if anything is working.

Most of this is one-time infrastructure. Once shipped, it runs silently.

**Main design doc:** `plans/geo-seo-strategy.md`

**Parallel with:** Phase 2 (content can be drafted while infra is built)

**Duration:** 7 days

---

## Tasks

### Task 1: Public MCP docs server (`@vertz/docs-mcp`)

**Why first:** This is the single highest-leverage action available to us. A developer running Claude Code, Cursor, Windsurf, or Zed installs the MCP server and suddenly every LLM they use has perfect Vertz knowledge. Bypasses training cutoff entirely.

**Files:** (5)
- `packages/docs-mcp/package.json` (new) — `@vertz/docs-mcp`, bin entry, publishConfig: public
- `packages/docs-mcp/src/index.ts` (new) — stdio MCP server entry, spawned via `npx @vertz/docs-mcp`
- `packages/docs-mcp/src/tools.ts` (new) — MCP tool definitions: `search_docs`, `get_doc`, `list_guides`, `get_example`
- `packages/docs-mcp/src/docs-index.ts` (new) — compiled docs index, pre-built during package prepublish from `packages/mint-docs/`
- `packages/docs-mcp/README.md` (new) — install instructions for Claude Code, Cursor, Windsurf, Zed

**What to implement:**

MCP server exposing these tools:
- `search_docs(query: string, limit?: number = 5)` → ranked excerpt matches from guides + API reference
- `get_doc(path: string)` → full markdown content of a doc page
- `list_guides()` → flat list of all available guide paths with titles and descriptions
- `get_example(name: string)` → full source of a code example from `examples/`

Docs index built at package prepublish: walk `packages/mint-docs/`, parse frontmatter, tokenize content, build a simple BM25 or keyword-match index. No embeddings in v1 (cost + simplicity). Ship as JSON bundled in the package.

Install instructions in README for each target client:
```bash
# Claude Code
claude mcp add vertz-docs -- npx -y @vertz/docs-mcp

# Cursor (settings.json)
{"mcpServers": {"vertz-docs": {"command": "npx", "args": ["-y", "@vertz/docs-mcp"]}}}

# Windsurf / Zed: equivalent JSON config
```

**Acceptance criteria:**
- [ ] `npx @vertz/docs-mcp` starts a working stdio MCP server
- [ ] `search_docs("how to define an entity")` returns top 5 ranked doc excerpts
- [ ] `get_doc("guides/entities")` returns full guide markdown
- [ ] Integration test: spawn server, call each tool via MCP SDK, assert shape
- [ ] README install instructions verified on Claude Code + Cursor (manual smoke test)
- [ ] Published to npm as `@vertz/docs-mcp` with provenance
- [ ] Landing page section "Use Vertz in your IDE" added to `vertz.dev/` home with copy-paste install for 4 clients

---

### Task 2: `llms-full.txt` + expanded JSON-LD + SSR `<head>` injection

**Why:** Current `llms.txt` is an index only. `llms-full.txt` serves the full content of docs + blog in one retrieval — preferred by LLMs that support it. JSON-LD on docs (not just blog) makes structured content parseable. SSR head injection is already deferred from #2947; it blocks rich snippets entirely.

**Files:** (5)
- `packages/landing/src/llms-full.ts` (new) — route handler generating `/llms-full.txt` with full blog + docs content inline
- `packages/landing/src/blog/seo/json-ld.ts` (modified) — extend with `TechArticle` + `FAQPage` + `SoftwareApplication` helpers
- `packages/landing/src/seo/head.tsx` (new) — SSR `<head>` injection: canonical, OG, Twitter card, JSON-LD script tag
- `packages/landing/src/pages/blog/post.tsx` (modified) — wire `<Head />` component into post render
- `packages/landing/src/__tests__/llms-full.test.ts` (new) — validates structure, content completeness, RFC format

**What to implement:**

`llms-full.txt` structure:
```
# Vertz — Full Stack TypeScript Framework, Designed for LLMs

## About
<one-paragraph summary from VISION.md>

## Core Principles
<bulleted list of 8 principles, one sentence each>

## Quick Start
<content of quickstart.mdx, flattened>

## Guides
### Entities
<full content of guides/entities.mdx>

### API Services
<full content of guides/services.mdx>

... (all guides)

## API Reference
<flattened api-reference content>

## Recent Blog Posts
### <title> (<date>)
<full post content>

... (latest 20 posts)
```

Served at `/llms-full.txt` with `Content-Type: text/plain; charset=utf-8` and `Cache-Control: public, max-age=3600`.

JSON-LD additions:
- `TechArticle` for every blog post (in addition to `BlogPosting`) — LLMs weight `TechArticle` higher for technical content
- `SoftwareApplication` on landing page root — with `applicationCategory: DeveloperApplication`, `operatingSystem: Cross-platform`, install instructions structured
- `FAQPage` on any page with Q&A sections (will be common in gotcha posts)

SSR `<head>` component injects on every page:
- `<title>`, `<meta name="description">` from frontmatter
- `<link rel="canonical">` absolute URL
- OG tags: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`
- Twitter card: `summary_large_image`
- `<script type="application/ld+json">` with structured data per page type
- `<link rel="alternate" type="application/rss+xml" href="/blog/feed.xml">` on blog pages

**Acceptance criteria:**
- [ ] `curl vertz.dev/llms-full.txt` returns >10KB of content with docs + blog inlined
- [ ] `llms-full.txt` cache-busted on every deploy
- [ ] Every blog post page renders canonical + OG + JSON-LD in `<head>` (assert via SSR test)
- [ ] JSON-LD validates against schema.org (run `schema-validator` in CI)
- [ ] Rich results test passes for 1 blog post (https://search.google.com/test/rich-results)
- [ ] `TechArticle` + `SoftwareApplication` + `FAQPage` all have helper builders in `seo/json-ld.ts` with unit tests

---

### Task 3: Sitemap expansion + IndexNow + Google Indexing API

**Why:** Static sitemap currently lists 3 URLs. New pages take 3–14 days for Google to crawl. IndexNow + Google Indexing API reduce this to hours. This is the difference between "post goes live" and "post is searchable."

**Files:** (5)
- `scripts/generate-sitemap.ts` (new) — walks blog + docs + landing, emits `public/sitemap.xml` with all URLs, priorities, changefreqs
- `scripts/ping-indexnow.ts` (new) — sends changed URLs to IndexNow (Bing/Yandex) on deploy
- `scripts/ping-google-indexing.ts` (new) — sends URL updates to Google Indexing API via service account
- `packages/landing/public/indexnow.txt` (new) — IndexNow verification key
- `.github/workflows/deploy.yml` (modified) — post-deploy step invokes both ping scripts

**What to implement:**

Sitemap generator runs during build. Emits:
```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://vertz.dev/</loc>
    <lastmod>2026-04-22</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://vertz.dev/blog</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <!-- one entry per blog post, one per doc page, one per landing page -->
</urlset>
```

IndexNow integration:
- Generate random 32-char key, host at `vertz.dev/<key>.txt`
- On deploy: `POST https://api.indexnow.org/indexnow` with changed URLs
- Track "changed URLs" via git diff of `public/sitemap.xml` vs previous deploy

Google Indexing API:
- Service account with Search Console access
- JWT auth against `https://indexing.googleapis.com/v3/urlNotifications:publish`
- POST `{"url": "...", "type": "URL_UPDATED"}` for each changed URL
- Rate limit: 200 URLs/day; chunk if needed

**Acceptance criteria:**
- [ ] `public/sitemap.xml` contains entries for every blog post, doc page, and landing route
- [ ] Sitemap validates at validator.w3.org
- [ ] Deploy triggers IndexNow ping with changed URLs (visible in server logs)
- [ ] Deploy triggers Google Indexing API ping (verify in GSC URL inspection within 4h)
- [ ] IndexNow key file accessible at `vertz.dev/<key>.txt`
- [ ] Integration test: after deploy, new URL appears in GSC inspection within 24h

---

### Task 4: Analytics foundation (PostHog + Plausible + referrer dashboard)

> **⚠ DEFERRED FROM v1.** Main doc §v1 Scope-cut defers Task 4 to post-v1 (weeks 5–6). In v1, use coarse Cloudflare Worker referer log parsing as the temporary proxy for Stop Condition 2. Do NOT implement this task during the 28-day window unless explicitly re-added to v1 scope.

**Why:** We cannot measure what we cannot see. Referrer tracking specifically catches `chatgpt.com`, `claude.ai`, `perplexity.ai` — the leading indicator of LLM citation traffic.

**Files:** (5)
- `packages/landing/src/analytics/posthog.ts` (new) — client-side PostHog init with autocapture disabled, specific event tracking
- `packages/landing/src/analytics/plausible.ts` (new) — Plausible script loader, event wrapper
- `packages/landing/src/analytics/referrer.ts` (new) — parses document.referrer, emits `llm_referrer` event when matches target domains
- `packages/landing/src/layout.tsx` (modified) — wires analytics into root layout with opt-out support
- `scripts/dashboards/llm-traffic.ts` (new) — queries PostHog API daily, outputs markdown summary to `~/vertz-dev/dashboards/`

**What to implement:**

PostHog config:
- Self-hosted or cloud — decision: use PostHog Cloud EU for speed
- Track: pageview, `doc_search`, `mcp_install_copied`, `github_star_click`, `npm_install_copied`
- Explicit `llm_referrer` event on load when `document.referrer` matches `/chatgpt|claude|perplexity|gemini|copilot|you\.com/i`

Plausible config:
- Privacy-first, GDPR-no-cookie — use alongside PostHog (different cuts)
- Track same events

Referrer dashboard script:
- Runs daily via cron
- Queries PostHog for `llm_referrer` events in last 7d
- Groups by source (ChatGPT / Claude / Perplexity / other)
- Outputs `~/vertz-dev/dashboards/llm-traffic-YYYY-MM-DD.md`

This task consumes existing plan `1836-docs-analytics-ga4-posthog.md`. Close that issue when done.

**Acceptance criteria:**
- [ ] PostHog + Plausible both receive pageview events from vertz.dev (verify in dashboards)
- [ ] `llm_referrer` event fires when opening page with `document.referrer` containing target domains (manual test: open vertz.dev from ChatGPT link)
- [ ] Opt-out via `localStorage.setItem('analytics-opt-out', '1')` works
- [ ] Daily dashboard script produces markdown summary (manual first run)
- [ ] No PII captured: no email, no user ID unless explicitly opted in
- [ ] Issue #1836 closed with link to this task

---

### Task 5: Citation tracker baseline

**Why:** We cannot claim success without measuring LLM citations. This script runs daily, asks 4 LLMs a fixed query set, counts Vertz mentions. It is the ground truth for G1 (primary goal).

**Files:** (4)
- `scripts/citation-tracker/queries.ts` (new) — 20 baseline queries (comparison, recommendation, gotcha, tutorial)
- `scripts/citation-tracker/providers.ts` (new) — wrappers for ChatGPT (GPT-5-search), Claude (with web), Perplexity API, Gemini
- `scripts/citation-tracker/run.ts` (new) — main entry, runs all queries × all providers, writes CSV
- `scripts/citation-tracker/README.md` (new) — how to interpret, baseline snapshot

**What to implement:**

Query set (`queries.ts`):
```ts
export const queries = [
  { id: 'recommend-ts-framework', text: 'What TypeScript framework would you recommend for building an LLM-generated application?' },
  { id: 'vs-next', text: 'What are alternatives to Next.js that work better with AI code generation?' },
  { id: 'type-safe-api', text: 'How do I build a type-safe REST API in TypeScript without writing schemas twice?' },
  { id: 'mcp-ts-framework', text: 'Is there a TypeScript framework with a built-in MCP server for docs?' },
  // ... 20 total, evenly split across: recommendation, comparison, gotcha, tutorial intents
];
```

Providers (`providers.ts`):
- ChatGPT: use `responses` API with `web_search` tool
- Claude: use Messages API with `web_search` tool
- Perplexity: `sonar-pro` model
- Gemini: `gemini-2.5-pro` with search grounding

For each (query × provider):
- Send query, capture response
- Regex match `/vertz(\.dev)?/i` for mentions
- Extract cited URLs containing `vertz.dev`
- Log: `{date, queryId, provider, mentioned: bool, urlsCited: string[], responseSnippet: string}`

Run cost: ~$0.50/day for 20 queries × 4 providers. Budget: $15/month.

Store output in `~/vertz-dev/citation-tracker/YYYY-MM-DD.csv` and aggregate in `history.csv`.

**Acceptance criteria:**
- [ ] `bun run scripts/citation-tracker/run.ts` executes all 20 queries × 4 providers, writes CSV
- [ ] Baseline run completed on day 1 of phase — expected: 0 mentions across all 80 cells (confirms starting state)
- [ ] CSV columns: `date, query_id, provider, mentioned, urls_cited, response_snippet`
- [ ] Week-over-week diff script exists: `scripts/citation-tracker/diff.ts` that compares two CSVs and flags new citations
- [ ] GitHub Actions workflow triggers daily at 6am BRT, commits CSV to a private repo or S3 (not `vertz` public repo)
- [ ] README documents interpretation: "1 new mention = leading indicator; sustained >20% mention rate = goal met"

---

## Dependencies between tasks

```
Task 1 (MCP server)           ─── independent, ship first
Task 2 (llms-full + JSON-LD)  ─── independent, ship in parallel
Task 3 (sitemap + IndexNow)   ─── depends on Task 2 (sitemap pulls from same source of truth)
Task 4 (analytics)            ─── independent, ship in parallel
Task 5 (citation tracker)     ─── independent, ship first (we need the baseline immediately)
```

Tasks 1, 2, 4, 5 can start on day 1 in parallel. Task 3 starts when Task 2's sitemap source is stable.

## Done when

- [ ] All 5 tasks' acceptance criteria checked
- [ ] Lighthouse score ≥95 on homepage, /blog, /blog/[slug], and 1 docs page
- [ ] GSC shows all blog posts + docs pages indexed within 48h of completion
- [ ] Citation tracker baseline CSV committed with day-1 snapshot
- [ ] MCP server has ≥10 npm downloads in first 48h after publish (soft signal — validates install instructions work)
- [ ] Phase review file written at `reviews/geo-seo-strategy/phase-01-foundation-infra.md` by a different agent
