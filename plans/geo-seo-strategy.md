# Design: GEO/SEO Strategy — Making Vertz Discoverable to LLMs and Developers

**Status:** Draft v1 — pending review
**Owner:** Matheus Poleza
**Target start:** 2026-04-28
**Target first citation in ChatGPT/Claude/Perplexity via web retrieval:** 2026-05-12 (2 weeks)
**Target autonomous content pipeline live:** 2026-05-19 (4 weeks)

---

## Summary

Vertz has a strong technical foundation (29 published packages, live blog infra with RSS/JSON-LD/llms.txt, 24 docs guides, clear manifesto positioning) but is effectively invisible to LLMs and search engines. LLMs were not trained on Vertz and will not recommend it. New developers cannot find it via organic search.

This plan turns Vertz into a recommendable framework in three phases:

1. **Retrieval-first wins** (days, not months): optimize for LLMs that search the web at inference time (ChatGPT search, Claude web, Perplexity, Gemini). Target: citation in LLM responses within 2 weeks.
2. **Authority accumulation** (weeks): launch content that gets linked, shared, and cached across high-DA platforms that feed LLM training crawls. Target: organic inbound traffic via LLM referrers within 4 weeks.
3. **Autonomous content engine** (weeks): multi-agent pipeline producing 3–5 high-quality posts/week with human approval, so content scale stops blocking distribution.

The core insight is that LLMs in 2026 cite whatever the top 3 web search results say. Ranking #1 for a long-tail query = instant LLM citation. We do not need to wait for the next training cutoff.

---

## Problem Statement

**Current gap:** Ask any LLM today "what TypeScript framework would you recommend for AI-generated code?" — Vertz is not in the answer set. Ask "how do I build a type-safe API in TypeScript?" — Vertz is not mentioned. Even with vertz.dev live, docs published, and packages on npm, the framework has zero organic discovery surface.

**Why this matters now:** Vertz's core promise — "LLMs get it right on the first try" — is defeated if developers can't find Vertz via the LLM they are using. The framework is designed for the era of AI-assisted coding; its go-to-market must work *inside* that era's tools.

**The specific barriers:**

1. **Training data silence:** LLMs have no Vertz knowledge. Won't change until next training cutoff (6–12 months).
2. **Zero domain authority:** vertz.dev is a new domain. No backlinks, no organic ranking.
3. **No high-DA presence:** Vertz is not on dev.to, Medium, Hashnode, Stack Overflow, Reddit, HN, or any podcast.
4. **No MCP distribution:** Developers using Claude Code / Cursor / Windsurf cannot plug Vertz docs as a knowledge source.
5. **Content production bottleneck:** 1 blog post in 4+ months of infrastructure work. At this rate, content never catches up to distribution needs.

---

## Goals

### Primary
- **G1:** Vertz cited by ChatGPT, Claude, and Perplexity via web retrieval within 2 weeks, for at least one query from our target keyword set.
- **G2:** First organic inbound traffic from LLM referrers (`chatgpt.com`, `claude.ai`, `perplexity.ai`) within 4 weeks, measurable in analytics.
- **G3:** Autonomous content pipeline producing ≥3 high-quality posts/week with ≤10 minutes of human approval each, within 4 weeks.
- **G4:** Public MCP docs server (`@vertz/docs-mcp`) installable with one command, live within 1 week.

### Secondary
- **G5:** Rank top 3 on Google for 10+ long-tail queries within 6 weeks (e.g., "typescript framework for llm code generation", "mcp server typescript framework").
- **G6:** Frontpage Hacker News launch within 2 weeks (top 30 by noon PT).
- **G7:** 3+ third-party mentions (influencer, podcast, newsletter) within 4 weeks.
- **G8:** 1,000+ GitHub stars added within 6 weeks.

### Business outcome
- **BO1:** 50+ sign-ups / scaffold-runs / first-install events per week attributable to organic discovery within 6 weeks.
- **BO2:** At least one inbound community / enterprise / contributor lead per week within 8 weeks.

---

## Non-Goals

- **Not running paid ads on Google/Facebook/X.** Paid acquisition can come later — organic-first. Exception: pre-negotiated newsletter sponsorships (Bytes, JS Weekly) are allowed because the artifact is a permanently-archived web page that LLMs crawl, not ephemeral ad impressions.
- **Not targeting non-TypeScript developers.** Python, Go, Rust devs are out of scope. Focus: TypeScript, full-stack, AI-assisted crowd.
- **Not building our own analytics platform.** PostHog + Plausible + Google Search Console is enough.
- **Not writing for SEO ranking alone.** Every piece of content must be technically correct and useful even if it never ranked. We refuse to produce "SEO content" in the pejorative sense.
- **Not attempting to influence training cutoffs directly.** That is an output of doing this plan well, not a target we can control.
- **Not gating content behind email signup.** Every post, every doc page, every benchmark is free and indexable.
- **Not localizing content in phase 1.** English only until we validate the funnel. Portuguese/Spanish is a phase 2+ consideration.

---

## Manifesto Alignment

This strategy is not a departure from Vertz's principles — it is an extension of them.

| Principle | How this strategy honors it |
|---|---|
| **1. If it builds, it works** | Every code snippet in every post is validated via `vtz test` before publish. No dead snippets. No "trust me, this runs." The pipeline refuses to publish code that doesn't compile. |
| **2. One way to do things** | Content has one canonical home (`vertz.dev/blog`). One authoritative source per topic. Cross-posts always link back. No conflicting versions of the same guide. |
| **3. AI agents are first-class users** | LLMs are a primary audience for *content itself*, not just the framework. Docs, blog posts, and the MCP server are designed so an LLM can consume them in a single retrieval call and produce correct code. |
| **4. Test what matters, nothing more** | Only 4 content formats (comparisons, gotchas, tutorials, opinions). Each has a template. No vanity content. No "Top 10" listicles. |
| **5. If you can't test it, don't build it** | Every post with code includes runnable examples in `examples/` repo. Broken examples = post is retracted. |
| **6. If you can't demo it, it's not done** | Every post links to a live demo or CodeSandbox. A tutorial without a running result doesn't ship. |
| **7. Performance is not optional** | Lighthouse score ≥95 required for every published page. Core Web Vitals green. LLMs penalize slow sites in retrieval ranking. |
| **8. No ceilings** | Where existing tools fail (e.g. content pipelines that require human drafting), we build our own (autonomous multi-agent pipeline). This is the meta-dogfood: Vertz + Claude Code building the thing that markets Vertz. |

The North Star quote — *"My LLM nailed it on the first try."* — becomes the primary social proof asset. Every benchmark, every case study, every customer quote ladders up to it.

---

## Research Summary

### How LLMs actually cite content in 2026

Three mechanisms, in order of ROI:

1. **Retrieval at inference time** (fastest, biggest lever)
   - ChatGPT search, Claude with web, Perplexity, Gemini, Copilot all perform web search during response generation
   - They cite the top 3–5 results from underlying search (Bing or Google)
   - **Implication:** rank #1 for a long-tail keyword = cited immediately, no training required
   - Citation preference: FAQPage schema (ChatGPT), Article/TechArticle schema (all), structured entities (Perplexity)

2. **Training crawl** (slow but permanent)
   - GitHub, Stack Overflow, Reddit, dev.to, Hashnode, Medium, npm are heavily crawled
   - Newsletter archives (Bytes, JS Weekly, TLDR Web Dev) are permanent web pages, not ephemeral
   - Cross-posts with canonical back are explicitly rewarded (not duplicated penalty)
   - **Implication:** every piece of content must go to 4+ channels

3. **MCP / direct tool-use** (emergent, high leverage)
   - Claude Code, Cursor, Windsurf, Zed all support MCP servers
   - A developer who installs `@vertz/docs-mcp` gets perfect Vertz knowledge in their LLM without Anthropic/OpenAI retraining anything
   - **Implication:** publishing an MCP docs server is the single highest-leverage action available to us

### Adversarial considerations

- **Google is aggressively penalizing thin AI content in 2026.** Pure-AI posts without human review get deranked. Our pipeline has mandatory human approval.
- **Perplexity re-ranks based on citation count from other sites.** First-party content alone is insufficient; we need third-party mentions.
- **HN / Reddit are spam-allergic.** One-shot launches only. No serial posting. No fake upvotes.
- **llms.txt adoption is still partial.** It is a free win but cannot be the only strategy.

### Competitor pattern analysis

- **Next.js** won via aggressive Vercel-backed content marketing + celebrity DX voices (Lee Robinson, Guillermo Rauch). Not replicable without $.
- **Astro, Hono, Remix** won via viral HN launches + consistent technical posts from core team. Replicable.
- **tRPC, Zod** won via solving one painful thing brilliantly and letting Twitter dev community do distribution. Replicable.
- **Common factor across all:** a single dev-personality voice plus one sharp differentiating hook, repeated until it sticks.

Our hook: **"LLMs write Vertz code correctly on the first try. We have the benchmark to prove it."**

---

## Strategy Overview

### The three layers

```
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Autonomous Engine                              │
│ Multi-agent content pipeline, 3-5 posts/week            │
│ (sustains layer 2 output long-term)                     │
└─────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Authority & Distribution                       │
│ Flagship benchmark + comparisons + HN + PH + sponsors   │
│ (generates backlinks and third-party mentions)          │
└─────────────────────────────────────────────────────────┘
                          ▲
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Infrastructure & Retrieval                     │
│ MCP server, llms-full.txt, JSON-LD, IndexNow, analytics │
│ (makes everything above findable and measurable)        │
└─────────────────────────────────────────────────────────┘
```

Each layer is a precondition for the next. We cannot launch (layer 2) if the landing site is not measurable (layer 1). We cannot automate (layer 3) without proven templates from human-written seed content (layer 2).

### Priority framework

For every candidate action, score on two axes:

- **Time-to-impact:** days / weeks / months
- **Ceiling:** how much upside if it works

```
                 High ceiling
                      │
   MCP server  ●      │     ● Benchmark viral post
   (weeks)            │       (days, but content-heavy)
                      │
   Long-tail pages ●  │     ● HN launch
   (days)             │       (days, 1-shot)
                      │
   ──────────────────┼─────────────────── fast to impact
                      │
   SO answers      ●  │     ● Newsletter sponsorship
   (days, grinding)   │       (immediate, permanent)
                      │
                 Low ceiling
```

Phase ordering follows this: do the top-right quadrant first (benchmark + HN + sponsorships + MCP), then top-left (long-tail landing pages), then bottom quadrants as sustained operations.

### Content formats (only 4)

We commit to 4 formats. Every post must be one of them:

1. **Comparison** (`/blog/vs-*`) — "Vertz vs Next.js for AI code generation", "Vertz vs tRPC vs NestJS typing" — concrete benchmarks, side-by-side code, opinionated verdict
2. **Gotcha** (`/blog/fix-*`) — "Fix: `TypeError: rules.authenticated is not a function`" — error string in title, error string in H1, step-by-step fix, links to docs
3. **Tutorial** (`/blog/build-*`) — "Build a typed REST API in 50 lines with Vertz" — runnable end-to-end, link to repo, video optional
4. **Opinion** (`/blog/why-*` or `/blog/against-*`) — "Why we rejected decorators", "Against GraphQL for internal APIs" — strong stance, data-backed, expect controversy

No "What's new in Vertz 0.3", no changelog posts, no "Top 10" listicles. Those get demoted by every LLM ranking system because they are zero-signal.

### Keyword strategy

Target long-tail queries where competition is ≤10 pages globally. Examples already mapped:

- "typescript framework for llm code generation"
- "mcp server typescript framework docs"
- "claude code typescript scaffold"
- "typescript orm type safe end to end"
- "typescript framework without decorators"
- "type safe api without trpc"
- "cloudflare workers typescript full stack framework"
- "vercel alternative for typescript llm app"

Full list of 30 long-tails produced in Phase 2. Each becomes a dedicated landing page.

### Distribution channels (priority-ordered)

Each flagship post hits **minimum 5 channels** on the same day:

| Channel | DA/reach | Type | Effort |
|---|---|---|---|
| vertz.dev/blog | — (canonical) | Long-form | 1x |
| dev.to | DA 90 | Cross-post with canonical back | 5 min |
| Hashnode | DA 85 | Cross-post with canonical back | 5 min |
| GitHub Discussions (vertz repo) | DA 100 | Excerpt + discussion prompt | 5 min |
| X thread | — | Threaded summary | 15 min |
| LinkedIn post | — | Executive summary | 5 min |
| Reddit (r/typescript, r/webdev) | — | 1x per week max | 15 min |
| Hacker News | — | Flagship launches only | Prep |
| Product Hunt | — | 1x launch | Prep |
| YouTube | — | Video version (optional) | 2h |
| Newsletters (sponsor or pitch) | DA varies | Flagship posts only | — |

---

## Infrastructure Requirements

### Already shipped (leverage)
- MDX blog pipeline with Shiki, auto-heading anchors (Phase 6-7 of #2947)
- RSS feed at `/blog/feed.xml`
- Dynamic `llms.txt` at `/llms.txt`
- Static `/public/sitemap.xml`
- `BlogPosting` JSON-LD helper module
- robots.txt with sitemap + llms.txt references
- 29 npm packages published with provenance

### Must build (Phase 1)
- `@vertz/docs-mcp` — public MCP server serving docs (npm package)
- `llms-full.txt` — full content dump for one-retrieval LLM consumption
- `TechArticle` + `SoftwareApplication` + `FAQPage` JSON-LD on docs pages (not just blog)
- SSR `<head>` injection hook — canonical, OG, structured data wiring
- Static sitemap includes all blog URLs + docs pages (not dynamic only)
- Per-post OG images via satori (was deferred — needed now)
- IndexNow integration (Bing/Yandex instant indexing)
- Google Indexing API integration
- PostHog + Plausible analytics (consumes tracked issue #1836)
- Citation tracker (daily cron, asks ChatGPT/Claude/Perplexity/Gemini test queries, counts Vertz mentions)
- Referrer-based analytics dashboard (how much traffic comes from `chatgpt.com`, `claude.ai`, `perplexity.ai`)

### Must build (Phase 4)
- Content pipeline orchestrator (`scripts/content-pipeline.ts`)
- Topic picker agent (reads GSC + GitHub issues + Semrush gaps)
- Writer agent (templated per format)
- Code validator agent (runs every snippet via `vtz test`)
- Reviewer agent (adversarial, blocks weak content)
- Publisher agent (multi-channel with canonical linking)
- Approval UI (5-10 min human gate, can be Slack/email + link)

---

## Autonomous Pipeline Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                   WEEKLY CRON (Mon 9am BRT)                    │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│ 1. TOPIC PICKER AGENT                                          │
│ Inputs: GSC queries with impressions but no clicks (gaps),     │
│         open GitHub issues tagged `content`, Semrush keyword   │
│         research, PostHog top-searched terms                   │
│ Output: 5 candidate topics with format (comparison/gotcha/     │
│         tutorial/opinion), keyword target, expected length     │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│ 2. TOPIC APPROVAL (human, 2 min)                               │
│ Slack message with 5 topics. Approve 2-3. Reject rest.         │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│ 3. WRITER AGENT (one per approved topic, parallel)             │
│ Inputs: topic spec, format template, existing docs via MCP,    │
│         VISION/MANIFESTO for voice, previous posts for style   │
│ Output: Full MDX draft with frontmatter, runnable code,        │
│         links to docs, suggested OG title/description          │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│ 4. CODE VALIDATOR AGENT                                        │
│ Extracts every code block. Creates temp project. Runs vtz test │
│ + vtz run typecheck. If any fail, returns errors to writer.    │
│ Max 3 retry loops. Then escalate to human.                     │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│ 5. REVIEWER AGENT (adversarial)                                │
│ Checks: manifesto alignment, factual accuracy, no marketing    │
│ fluff, no duplicated content, SEO basics (title, H1, meta),    │
│ unique angle present. Blocks with specific findings if weak.   │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│ 6. PUBLISH APPROVAL (human, 5-10 min)                          │
│ Slack/email with preview link. Approve = goes live.            │
│ Reject with notes = back to writer for 1 revision.             │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│ 7. PUBLISHER AGENT                                             │
│ - git commit + push to feat/blog-{slug} (or main if settled)   │
│ - cross-post to dev.to with canonical                          │
│ - cross-post to Hashnode with canonical                        │
│ - draft X thread (requires manual post)                        │
│ - draft LinkedIn post (requires manual post)                   │
│ - ping IndexNow + Google Indexing API                          │
│ - create GitHub Discussion excerpt                             │
│ - log to tracking sheet                                        │
└────────────────────────────┬───────────────────────────────────┘
                             ▼
┌────────────────────────────────────────────────────────────────┐
│ 8. TRACKER AGENT (daily, separate cron)                        │
│ Queries ChatGPT, Claude, Perplexity, Gemini with test set.     │
│ Counts Vertz mentions. Stores CSV. Alerts on regressions.      │
└────────────────────────────────────────────────────────────────┘
```

Human interaction points: 2 (topic approval, publish approval). Total time per post: ~10 min. Weekly time budget: 30–60 min for 3-post week. All other work is autonomous.

Built on top of: Claude API directly (via `@anthropic-ai/sdk`), Vertz agents (`@vertz/agents`) for workflow orchestration, GitHub for version control, Vercel/Cloudflare cron triggers.

---

## Success Metrics

### Leading indicators (check weekly)
- Number of pages on vertz.dev indexed by Google (GSC)
- Number of long-tail queries ranking top 10 (GSC)
- Third-party backlinks gained (Ahrefs or manual tracking)
- X mentions of "@vertz" / "vertz.dev" / "vertz framework"
- GitHub stars gained this week
- npm downloads of `vertz` and `@vertz/*`

### Lagging indicators (check monthly)
- Citation tracker score: % of test queries that mention Vertz across ChatGPT / Claude / Perplexity / Gemini
- Unique visitors per week
- Referrer traffic from `chatgpt.com`, `claude.ai`, `perplexity.ai`, `gemini.google.com`
- `vtz create` / scaffold invocations per week (if telemetry exists)
- Inbound community/enterprise leads per week

### Acceptance thresholds at 6 weeks
- [ ] ≥1 test query returns Vertz citation in all 4 LLMs (ChatGPT, Claude, Perplexity, Gemini)
- [ ] ≥10 long-tail queries ranking top 3 on Google
- [ ] ≥20 third-party backlinks from DA 30+ sites
- [ ] ≥15 blog posts published (3/week × 5 weeks after ignition)
- [ ] ≥500 GitHub stars net gained
- [ ] ≥1,000 weekly unique visitors to vertz.dev
- [ ] Autonomous pipeline produces ≥3 posts/week for 2 consecutive weeks

---

## Unknowns & Risks

| Unknown / Risk | Mitigation | Owner |
|---|---|---|
| Will LLM web-retrieval actually cite long-tail rankers? | Phase 1 ships citation tracker on day 1. First signal in 3-5 days. If no citations, pivot to schema + MCP heavier. | Matheus |
| Budget for newsletter sponsorships (~$5-10k for Bytes / JS Weekly / TLDR) | Start without. Evaluate at week 3 based on traction. Organic-only path is slower but free. | Matheus |
| HN / PH launch timing (bad day = dead launch) | Pre-announce to Twitter following. Coordinate with one known dev voice for early upvote. Aim for Tue/Wed 9am PT. | Matheus |
| Autonomous content quality drift | Mandatory human approval gate. Weekly retro analyzing last 10 posts vs manifesto. Kill switch if review finds 2+ weak posts in a row. | Matheus |
| Claude Code / Anthropic relationship (MCP endorsement, blog post, etc) | Explore opportunistically. Not blocking. If it happens, it's acceleration; if not, we're fine. | Matheus |
| Google penalizes our AI-assisted content | Every post is human-approved, every snippet is validated. Content is technically correct and differentiated. Unlikely to trigger. | Matheus |
| Competitor retaliation or ecosystem noise (Next.js adding "AI mode", similar positioning) | Our defense is execution speed + MCP integration. First mover on "frameworks with public MCP" beats feature-copycat. | Matheus |
| Traffic but no conversion (visitors don't try Vertz) | Phase 1 includes PostHog funnel. If CVR <2% at week 3, revisit landing page messaging separately. | Matheus |
| Rate limits on Claude API during pipeline scale-up | Use `@vertz/agents` with queueing. Worst case: downgrade to Haiku for drafts, Opus for review. | Matheus |

**POC Results:**
- No POC needed for infrastructure work (MCP, IndexNow, JSON-LD expansion — proven standards)
- Content pipeline has one POC assumption: Claude can write a manifesto-aligned comparison post of similar quality to a human in ≤2 hours of wall time. This will be validated in Phase 2 when we write the first 3 comparison posts ourselves before automating them.

---

## E2E Acceptance Test

### Scenario A: Developer asks ChatGPT about Vertz indirectly
**Given** a developer opens ChatGPT with web search enabled
**When** they ask "What's a TypeScript framework that works well with LLM-generated code?"
**Then** the response mentions Vertz with a link to vertz.dev in the top 3 suggestions
**And** the response summarizes Vertz correctly (full-stack TS, LLM-native, type-safe end-to-end)

### Scenario B: Developer hits a gotcha
**Given** a developer sees `TypeError: rules.authenticated is not a function`
**When** they Google the error
**Then** vertz.dev/blog/fix-rules-authenticated appears in top 3 results within 24h of publish
**And** the page solves their issue in under 30 seconds of scanning

### Scenario C: Developer installs MCP server
**Given** a developer has Claude Code installed
**When** they run `claude mcp add @vertz/docs`
**Then** MCP server connects successfully
**And** asking Claude "scaffold a Vertz project with auth and a tasks entity" produces compiling code on first try

### Scenario D: Autonomous pipeline publishes
**Given** the content pipeline cron triggers on Monday 9am BRT
**When** Matheus approves 2 topics via Slack
**Then** within 4 hours, 2 publish-approval requests arrive in Slack with preview links
**And** upon approval, posts are live on vertz.dev + dev.to + Hashnode with canonical tags
**And** X thread drafts are ready to send
**And** IndexNow + Google Indexing API are pinged

### Scenario E: Citation tracker catches a win
**Given** the citation tracker runs daily at 6am BRT
**When** a new week's run completes
**Then** results are logged to a Google Sheet
**And** any week-over-week improvement or regression triggers a Slack notification
**And** by week 4, at least one query shows citation in ≥2 of 4 target LLMs

---

## Phase Breakdown

Each phase lives in `plans/geo-seo-strategy/phase-NN-<slug>.md` and is self-contained — another agent can pick up a phase without reading the main doc.

| Phase | Slug | Duration | Outcome |
|---|---|---|---|
| **1** | `phase-01-foundation-infra.md` | Days 1–7 | MCP server live. IndexNow + Google Indexing API integrated. llms-full.txt + expanded JSON-LD + SSR head. Analytics (PostHog + Plausible). Citation tracker baseline. |
| **2** | `phase-02-ignition-content.md` | Days 1–10 (parallel) | Benchmark post (flagship). 3 comparison posts. 30 long-tail landing pages. README rewrite with benchmark. Awesome-list submissions. |
| **3** | `phase-03-distribution-blitz.md` | Days 8–14 | HN launch. Product Hunt launch. Reddit blitz. Newsletter sponsorships. Influencer outreach. Stack Overflow seeding. GitHub Discussions activation. |
| **4** | `phase-04-autonomous-pipeline.md` | Days 10–21 | Multi-agent content pipeline end-to-end. 7 agents. Human approval gates. First autonomously-produced post published. |
| **5** | `phase-05-measurement-iteration.md` | Days 14+ (ongoing) | Citation tracker daily cron. Weekly retro cadence. Dashboard for leading + lagging indicators. Pipeline tuning loop. |

Phases 1 and 2 run in parallel starting day 1. Phase 3 depends on both. Phase 4 depends on Phase 2 templates. Phase 5 starts after Phase 1 infrastructure lands.

---

## Definition of Done (overall feature)

- [ ] All 5 phases complete with their acceptance tests passing
- [ ] 6-week acceptance thresholds met (see Success Metrics)
- [ ] Retrospective written in `plans/post-implementation-reviews/geo-seo-strategy.md`
- [ ] Autonomous pipeline running for 2 consecutive weeks without human-initiated intervention beyond approval gates
- [ ] At least 1 LLM cites Vertz via web retrieval for a targeted query
- [ ] Citation tracker + analytics dashboards handed off to a weekly review cadence

---

## Open questions for review

1. **Budget commitment.** Are we committing $5-10k for newsletter sponsorships in week 2-3, or running organic-only?
2. **MCP server scope.** Does `@vertz/docs-mcp` serve only docs, or also live examples + playground queries? Broader = more powerful, narrower = faster to ship.
3. **Who owns the human approval gates?** Matheus solo for now, or shared with josh/team?
4. **Content pipeline tech choice.** Run on Vertz itself (dogfood) or standalone TS script? Dogfood has narrative value but adds coupling.
5. **Launch ordering.** HN first (technical audience), Product Hunt first (wider but noisier), or same-day both?
6. **Anthropic relationship.** Do we actively pursue co-marketing (blog post on anthropic.com, Claude Code scaffold option) or wait for organic traction to warrant the ask?

These questions must be resolved before Phase 3 starts.
