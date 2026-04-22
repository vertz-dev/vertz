# Phase 2: Ignition Content

## Context

Distribution without content is noise. This phase produces the seed content that (a) proves to LLMs that Vertz is a real, substantive framework worth citing, (b) gives us something to distribute in Phase 3, and (c) establishes templates the autonomous pipeline will reuse in Phase 4.

Everything here is written by a human (Matheus + Claude pair) — no autonomous generation yet. These become the golden examples future AI-generated posts are compared against.

**Main design doc:** `plans/geo-seo-strategy.md`

**Parallel with:** Phase 1 (content can be drafted while infra is built; publish gated on Phase 1 completion)

**Duration:** 10 days (drafts from day 1, publishes when Phase 1 lands)

---

## Tasks

### Task 1: The flagship benchmark post ("The LLM Benchmark")

**Why:** This is the single piece of content the entire strategy orbits around. It is the proof of the North Star claim: "My LLM nailed it on the first try." Without a real benchmark, the claim is marketing. With it, the claim is a data point LLMs cite forever.

**Files:** (5)
- `packages/landing/content/blog/2026-04-28-llm-framework-benchmark.mdx` (new) — the flagship post
- `benchmarks/llm-codegen/README.md` (new) — public, reproducible benchmark repo section
- `benchmarks/llm-codegen/prompts.ts` (new) — the 20 test prompts used
- `benchmarks/llm-codegen/scorer.ts` (new) — automated grader: compiles code, runs smoke tests
- `benchmarks/llm-codegen/results.json` (new) — run output, referenced by blog post

**What to implement:**

The benchmark:
- 20 realistic prompts: "build a tasks CRUD API with auth", "add a user settings page with validated form", "migrate DB schema to add soft-deletes", etc.
- Run each prompt on 4 frameworks: Vertz, Next.js + Drizzle + tRPC, Remix + Prisma, NestJS + TypeORM
- Run each prompt 5 times per framework (LLM nondeterminism requires n>1)
- Scorer: (1) does generated code compile? (2) do tests pass? (3) are types correct? (4) how many LLM turns to green?
- Same LLM (Claude Sonnet 4.6) for all frameworks — controls the prompt variable
- Pass rate + avg turns + avg token cost per framework reported

The post:
- Title: "We gave Claude 20 real tasks in 4 TypeScript frameworks. Here's what happened."
- Hook: table in first 200 words. Numbers up front. No preamble.
- Methodology section (transparent, reproducible)
- Per-framework breakdown with example failure modes (screenshots of error fixes)
- Vertz vs others: "89% vs 34%" or whatever the real number is — do not fabricate
- Conclusion that does NOT read as marketing. Acknowledge where competitors win.
- Link to `benchmarks/llm-codegen` repo section for full reproducibility
- Author: Matheus Poleza (personal tone, first person)

**Acceptance criteria:**
- [ ] Benchmark actually run. Real numbers. No synthetic data.
- [ ] If Vertz's pass rate is <60%, we do NOT publish — fix the framework first
- [ ] If competitors' pass rate is ≥80%, we do NOT publish — methodology likely flawed, revise
- [ ] Post is 1,500–2,500 words with 3 charts and 5 code comparisons
- [ ] Cross-post ready: dev.to, Hashnode, Medium drafts prepared with canonical back
- [ ] HN submission title drafted: "Show HN: Claude writes 89% correct TypeScript in Vertz, 34% in Next.js"
- [ ] Reviewer agent (human or separate Claude instance) adversarially reviewed before publish
- [ ] Post has runnable CodeSandbox link for one of the 20 prompts
- [ ] `benchmarks/llm-codegen/` repo section has README with "how to reproduce this" — anyone can re-run

---

### Task 2: Three "Vertz vs X" comparison posts

**Why:** Comparison queries are high-intent (dev is choosing) and zero-competition for Vertz specifically. Ranking #1 for "vertz vs next js" is trivial now and becomes a defensive moat once traffic flows.

**Files:** (4)
- `packages/landing/content/blog/2026-04-30-vertz-vs-nextjs-ai-codegen.mdx` (new)
- `packages/landing/content/blog/2026-05-02-vertz-vs-trpc-end-to-end-types.mdx` (new)
- `packages/landing/content/blog/2026-05-04-vertz-vs-nestjs-type-safety.mdx` (new)
- `examples/comparisons/README.md` (new) — runnable side-by-side examples for each comparison

**What to implement:**

Each post follows the comparison template:
- H1: "Vertz vs <X>: <specific angle>"
- TL;DR table in first 300 words (6 rows: type safety, LLM compatibility, build speed, bundle size, DX, learning curve)
- Why we're writing this (honest — "someone will pick one, here's data")
- Side-by-side: same task in both frameworks, same LLM, same prompt, show both outputs
- Specific wins for each side (credibility — don't claim Vertz wins everything)
- When to pick which one
- Links to both framework docs

Angles chosen to avoid direct attack vector:
- **vs Next.js**: "AI code generation correctness" (not "Next.js bad") — pulls from benchmark
- **vs tRPC**: "End-to-end type flow across database + API + UI" — Vertz's unique position (tRPC doesn't own DB)
- **vs NestJS**: "Type safety without decorators" — directly on manifesto message

Each post: 1,200–1,800 words, 2+ code diff pairs, 1 summary table.

**Acceptance criteria:**
- [ ] 3 posts drafted by end of day 5
- [ ] Each post has a runnable example in `examples/comparisons/` — same task, both implementations, both tested
- [ ] No marketing fluff: reviewer agent must approve tone
- [ ] Each post has clear "when to pick the other" section — not a hit piece
- [ ] Each post ranks top 10 in Google for its primary keyword within 14 days of publish

---

### Task 3: 30 long-tail landing pages

**Why:** Each is a <300-word page targeting a specific zero-competition long-tail query. Rank #1 in days. LLMs with web search cite top 3 results. Bulk instant-citations.

**Files:** (5) — generator + seed content
- `scripts/generate-long-tail-pages.ts` (new) — templating script
- `packages/landing/content/long-tail/` (new dir) — 30 small MDX files
- `packages/landing/src/pages/answer/[slug].tsx` (new) — route `/answer/<slug>`, SSR with schema
- `packages/landing/content/long-tail/keywords.json` (new) — the 30 target queries
- `packages/landing/src/__tests__/long-tail.test.ts` (new) — asserts rendering, JSON-LD, canonical

**What to implement:**

Keyword set in `keywords.json`:
```json
[
  { "slug": "typescript-framework-for-llm-code-generation", "query": "typescript framework for llm code generation", "intent": "recommendation" },
  { "slug": "mcp-server-typescript-framework-docs", "query": "mcp server typescript framework docs", "intent": "solution-search" },
  { "slug": "typescript-framework-without-decorators", "query": "typescript framework without decorators", "intent": "comparison" },
  // ... 30 entries total
]
```

Page template:
- Route: `vertz.dev/answer/<slug>`
- H1 matches the query verbatim
- Short direct answer in first paragraph (150-250 words)
- Runnable code snippet if applicable
- "Learn more" link to deeper docs/blog
- JSON-LD: `FAQPage` schema (ChatGPT preference) with Q (the query) and A (the answer)
- Canonical tag to itself
- Linked from `/answers` index page

Voice: direct, no fluff. Matches how LLMs summarize — so LLMs quote it verbatim.

**Acceptance criteria:**
- [ ] 30 pages live, each on a unique slug
- [ ] Each page <300 words, passes Lighthouse 95+
- [ ] Each page has `FAQPage` JSON-LD with query-verbatim question
- [ ] `/answers` index page lists all 30 with metadata
- [ ] Sitemap includes all 30
- [ ] IndexNow + Google Indexing API pinged on first deploy
- [ ] Within 14 days: 10 of 30 rank top 3 on Google (measured in Phase 5)

---

### Task 4: README rewrite + awesome-list submissions

**Why:** GitHub README is the highest-DA Vertz-controlled surface (DA 100). Awesome-* lists are high-crawl-frequency pages that LLMs use for framework discovery.

**Files:** (4)
- `README.md` (modified) — rewrite with benchmark numbers + positioning + install
- `.github/FUNDING.yml` (new or modified) — optional GitHub Sponsors enablement for signal
- `packages/landing/content/press/awesome-submissions.md` (new) — internal tracking of submission PRs
- `scripts/check-repo-discoverability.ts` (new) — asserts topics, description, link-preview tags

**What to implement:**

New README structure:
```
# Vertz — Full-Stack TypeScript, Built for LLMs

> Claude writes 89% correct Vertz code on the first try. 34% for Next.js. [benchmark →](link)

<install command — one line>

## Why Vertz
- If it builds, it works
- One way to do things
- AI agents are first-class users
- Performance is not optional

## Quick Start
<3 commands, working app>

## What's inside
- @vertz/db — typed ORM
- @vertz/server — entities, services, REST, OpenAPI
- @vertz/ui — compiled signals, JSX, SSR
- @vertz/agents — AI workflows
- vtz — Rust-powered runtime

## Use in your LLM
<MCP install 4 clients>

## Links
- Docs: docs.vertz.dev
- Blog: vertz.dev/blog
- Discord, Twitter
```

Awesome list submissions (PRs to):
- awesome-typescript
- awesome-nodejs
- awesome-cloudflare-workers
- awesome-ai-dev-tools
- awesome-llm-tools
- awesome-mcp-servers (critical — when @vertz/docs-mcp ships)

Each submission: single-line entry, link, one-sentence description. Track in `awesome-submissions.md`.

GitHub topics to add (verify on repo): `typescript-framework`, `llm`, `ai-native`, `full-stack`, `orm`, `ssr`, `mcp`, `type-safe`.

**Acceptance criteria:**
- [ ] README rewrite merged to main
- [ ] Benchmark post linked from README hero
- [ ] MCP install section visible above the fold
- [ ] 6 awesome-list PRs opened with correct formatting
- [ ] GitHub topics set on repo
- [ ] OpenGraph image for repo (GitHub social preview) shows Vertz branding (upload via repo Settings)

---

### Task 5: Seed content for autonomous pipeline templates

**Why:** Phase 4 needs templates. By writing 2 additional posts (gotcha + tutorial format), we lock in voice and structure so the writer agent has ground truth.

**Files:** (3)
- `packages/landing/content/blog/2026-05-06-fix-rules-authenticated-is-not-a-function.mdx` (new) — gotcha template example
- `packages/landing/content/blog/2026-05-08-build-typed-rest-api-in-50-lines.mdx` (new) — tutorial template example
- `content/templates/` (new dir) — 4 template files extracted from the 5 ignition posts

**What to implement:**

Gotcha post template:
```
H1: <exact error message>
Opening: 1 sentence describing when this happens
Fix: 2-4 step solution, code-first
Why: 1 paragraph explaining root cause
Related: links to docs + other gotchas
```

Tutorial post template:
```
H1: Build <X> in <N> lines with Vertz
Opening: end-result screenshot/code at top
Steps: numbered, each with code block, each compiles
Running it: how to start the dev server, what to click
Going further: links to deeper docs
Full source: link to examples repo
```

`content/templates/` extracts:
- `comparison.md` — frontmatter + structure
- `gotcha.md` — frontmatter + structure
- `tutorial.md` — frontmatter + structure
- `opinion.md` — frontmatter + structure

These become prompts for the writer agent in Phase 4.

**Acceptance criteria:**
- [ ] 2 new posts published (gotcha + tutorial)
- [ ] 4 templates committed in `content/templates/`
- [ ] Each template includes: frontmatter, heading structure, voice guidelines, SEO rules, canonical example link
- [ ] Reviewer agent validated that each of the 5 ignition posts (benchmark + 3 comparisons + gotcha + tutorial + this gotcha + tutorial — total 7) fits its template
- [ ] Templates tested by asking a fresh Claude instance to generate a draft from a template — output is 80%+ usable (manual check)

---

## Dependencies

```
Task 1 (benchmark post)       ─── needs benchmark run (~2-3 days of actual work)
Task 2 (3 comparisons)        ─── one comparison depends on benchmark data
Task 3 (30 long-tails)        ─── independent, can start day 1
Task 4 (README + awesome)     ─── depends on Task 1 (benchmark numbers in README)
Task 5 (templates)            ─── depends on Tasks 1-2 (extract templates from real posts)
```

Order: Task 3 day 1 (parallel). Task 1 days 1-5. Task 2 days 3-7. Task 4 day 6. Task 5 day 8-10.

## Done when

- [ ] All 5 tasks' acceptance criteria checked
- [ ] 7 published blog posts (benchmark + 3 comparisons + gotcha + tutorial + 1 opinion to be written if time)
- [ ] 30 long-tail pages live
- [ ] README reflects new positioning
- [ ] 6 awesome-list PRs opened (merge not required, submission is the work)
- [ ] All posts cross-posted to dev.to + Hashnode with canonical
- [ ] 4 templates committed for Phase 4 consumption
- [ ] Phase review file written at `reviews/geo-seo-strategy/phase-02-ignition-content.md` by a different agent
