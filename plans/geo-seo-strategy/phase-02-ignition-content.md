# Phase 2: Ignition Content

## Context

Distribution without content is noise. This phase produces the seed content that (a) proves to LLMs that Vertz is a real, substantive framework worth citing, (b) gives us something to distribute in Phase 3, and (c) establishes templates the autonomous pipeline will reuse in Phase 4.

Everything here is written by a human (Matheus + Claude pair) — no autonomous generation yet. These become the golden examples future AI-generated posts are compared against.

**Main design doc:** `plans/geo-seo-strategy.md`

**Parallel with:** Phase 1 (content can be drafted while infra is built; publish gated on Phase 1 completion)

**Duration:** 10 days (drafts from day 1, publishes when Phase 1 lands)

---

## Tasks

### Task 1: The flagship case-study post ("Radical Transparency: 5 LLM Transcripts")

**Rewritten from v1 per adversarial review.** The original plan was a statistical benchmark ("89% vs 34%"). Three reviewers independently flagged this as adversarially fragile: n=5 too small, 1 LLM biases toward Anthropic, "if competitors ≥80% revise methodology" is p-hacking. Budget of $200/month also rules out a statistically defensible run ($1.5k–$10k minimum for n≥20 × 4 LLMs × 4 frameworks).

The v2 approach is **"radical transparency case study"** instead of benchmark:
- Qualitative, not statistical. No p-hacking attack surface.
- Full transcripts published (the reader judges, not us).
- Focus: 2 frameworks compared (Vertz + Next.js) — not 4. Smaller + deeper beats shallow + broad.
- Smaller budget fits ceiling. Expected ~$80 one-time.
- Manifesto-aligned: no over-claim, honest about scope ("this is anecdotal evidence with full transcripts, not a statistical benchmark").

**Why this is stronger, not weaker:** full LLM transcripts are rare in framework marketing. The hook "Show HN: full transcripts of Claude building 5 apps in 2 frameworks" is unattackable — there's no methodology to dispute when readers can see every tool call, every retry, every error fix themselves.

**Files:** (5)
- `packages/landing/content/blog/2026-05-12-claude-builds-5-apps-case-study.mdx` (new) — the case-study post
- `benchmarks/case-study/README.md` (new) — repo section with task list, method, reproduction steps
- `benchmarks/case-study/tasks.md` (new) — the 3–5 task specs (Matheus decides count at start of phase)
- `benchmarks/case-study/transcripts/` (new dir) — full JSON transcripts from Claude tool-use sessions, committed raw
- `benchmarks/case-study/summary.md` (new) — qualitative comparison per task, author annotations

**What to implement:**

**The case study:**
- 3–5 realistic app-building tasks (Matheus picks at start — examples: "tasks CRUD with auth", "user settings form with validation", "DB migration with rollback", "search with pagination", "file upload with image preview")
- Each task run on 2 frameworks: Vertz and **one** comparison (Next.js + Drizzle + tRPC is the primary candidate — chosen because it is what Claude most often suggests today)
- Each task run **5 times per framework** with Claude Sonnet 4.6 — 5 runs reveals LLM variability without pretending to statistical significance
- Claude works agentically (tool-use loop with file edits + compiler feedback), not one-shot
- Every session fully logged: tool calls, file edits, compiler errors, corrections
- Transcripts committed raw as JSON — no curation, no cherry-picking

**Total sessions:** 3–5 tasks × 2 frameworks × 5 runs = **30–50 sessions**. At ~$1.50/session with tool-use, **~$45–$75 one-time**. Fits the budget.

**The post (~1,800 words):**
- Title (draft): "We published the full Claude transcripts of building 5 apps in Vertz vs Next.js"
- Opening: 3 sentences. What we did, why transcripts > statistics, link to the repo.
- Per-task section: one task, side-by-side summary of what happened, specific moments where frameworks diverged, 1–2 telling code diffs.
- Honest acknowledgment: "This is anecdotal evidence with full transcripts, not a statistically significant benchmark. n=5 per cell. You can judge the transcripts yourself."
- What we learned (honest): including tasks where Vertz lost or was slower.
- How to reproduce: exact steps, prompts, commit hashes.
- Author: Matheus Poleza, first person, personal voice (this is human-written, not pipeline).

**Methodology pre-registration (required before running):**
- `benchmarks/case-study/preregistration.md` committed to main 5–7 days **before** the first session
- Contains: task list, prompts verbatim, framework versions, model version, success criteria per task, how transcripts will be published
- Public gist link announced on X so critics can pre-comment on methodology before any data exists
- If reviewers flag methodology flaws in preregistration window, revise before running (not after seeing results)

**External review:**
- Before publish: share draft + transcripts with 1 respected non-Vertz engineer for methodology sanity check
- Candidates: Sebastian Markbåge, Jarred Sumner (Bun), Daniel Ehrenberg, or Shawn "swyx" Wang
- Offer: free early MCP access / implementation pairing in exchange
- Reviewer's feedback incorporated into the post's "limitations" section verbatim

**Acceptance criteria:**
- [ ] Preregistration committed to main and publicly announced ≥5 days before first run
- [ ] 3–5 tasks actually run with 5 iterations each. Real transcripts. No synthetic data.
- [ ] Transcripts committed raw — no editing, no "best of 5" selection
- [ ] Summary post published regardless of outcome (even if Next.js wins tasks)
- [ ] Post headline does NOT contain a statistic ("89%", "4x better", etc.) — only qualitative framing
- [ ] Post has explicit "limitations" section acknowledging n=5 per cell, 2 frameworks not 4, 1 LLM not 4
- [ ] Post has at least 1 section documenting where Vertz lost or performed worse
- [ ] Cross-post drafts for dev.to, Hashnode prepared with canonical back
- [ ] HN title drafted: "Show HN: Full Claude transcripts of building 5 apps in Vertz vs Next.js"
- [ ] External reviewer's feedback incorporated
- [ ] Total API spend ≤$80

**Removed from v1 acceptance criteria (per adversarial review):**
- ~~"If competitors ≥80% revise methodology"~~ — p-hacking. Replaced with: publish the result regardless.
- ~~"3 charts and 5 code comparisons"~~ — chart counts are arbitrary. Replaced with: let the content breathe, don't perform rigor.
- ~~"Author: Matheus Poleza, personal tone, first person"~~ — kept, since this IS written by Matheus (not pipeline). For pipeline-produced content in post-v1, author is `autonomous-pipeline (reviewed by Matheus)`.

---

### Task 2: Three "Vertz vs X" comparison posts

> **⚠ DEFERRED FROM v1.** Tasks 2–5 of Phase 2 sit post-v1 (weeks 5–10). In v1, only Task 1 (case-study post) ships. Comparison posts benefit from the case-study data and should come after.

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

> **⚠ DEFERRED FROM v1.** 30-at-once was flagged by adversarial review as speculative content (Principle 4 violation). Post-v1 approach: ship 3–5 at a time based on keyword data from the v1 case-study traffic.

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

> **⚠ DEFERRED FROM v1.** README rewrite depends on case-study findings. Awesome-list submissions stand alone and could be pulled into v1 if budget allows, but default: post-v1.

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

> **⚠ DEFERRED FROM v1.** Depends on Phase 4 (which is deferred). Seed templates extracted from Tasks 1–4 output post-v1.

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
- [ ] Reviewer agent validated that each of the 6 ignition posts (case-study + 3 comparisons + gotcha + tutorial) fits its template
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
- [ ] 6 published blog posts (case-study + 3 comparisons + gotcha + tutorial)
- [ ] 30 long-tail pages live
- [ ] README reflects new positioning
- [ ] 6 awesome-list PRs opened (merge not required, submission is the work)
- [ ] All posts cross-posted to dev.to + Hashnode with canonical
- [ ] 4 templates committed for Phase 4 consumption
- [ ] Phase review file written at `reviews/geo-seo-strategy/phase-02-ignition-content.md` by a different agent
