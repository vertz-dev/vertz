# Design: GEO/SEO Strategy — Making Vertz Discoverable to LLMs and Developers

**Status:** Draft v2 — revised after 3-agent adversarial review (see `reviews/geo-seo-strategy/`)
**Owner:** Matheus Poleza
**Target start:** 2026-04-28
**Target first citation in ChatGPT/Claude/Perplexity via web retrieval:** 2026-05-19 (3 weeks from start, 28-day v1 milestone)
**Full-scope acceptance thresholds:** 8–10 weeks (deferred from v1 — not part of 28-day window)

**Budget ceiling:** $200/month (hard cap across API + sponsorships + tooling). This constrains v1 scope significantly; see Budget section.

---

## Summary

Vertz has a strong technical foundation (29 published packages, live blog infra with RSS/JSON-LD/llms.txt, 24 docs guides, clear manifesto positioning) but is effectively invisible to LLMs and search engines. LLMs were not trained on Vertz and will not recommend it. New developers cannot find it via organic search.

This plan turns Vertz into a recommendable framework in three phases:

1. **Retrieval-first wins** (days, not months): optimize for LLMs that search the web at inference time (ChatGPT search, Claude web, Perplexity, Gemini). Target: citation in LLM responses within 3 weeks.
2. **Authority accumulation** (weeks): launch content that gets linked, shared, and cached across high-DA platforms that feed LLM training crawls. Target: organic inbound traffic via LLM referrers within 6 weeks.
3. **Autonomous content engine** (post-v1, weeks 5-10): multi-agent pipeline producing 3–5 high-quality posts/week with human approval, so content scale stops blocking distribution. **Deferred from the 28-day window per adversarial review feedback** — templates need to be grounded in real post performance before automating.

The core insight is that LLMs in 2026 cite whatever the top 3 web search results say. Ranking #1 for a long-tail query = instant LLM citation. We do not need to wait for the next training cutoff.

## v1 Scope-cut (28-day window)

The original plan committed 27 tasks in 28 days — adversarial review (technical feasibility) estimated this as 50–60% optimistic for one owner. v2 cuts v1 scope to what is honestly achievable:

**In scope for the 28-day v1 milestone:**
- Phase 0: merge #2947 to main
- Phase 1 Tasks 1, 2, 3, 5 (MCP server, SSR head injection, IndexNow, citation tracker baseline) — drop Task 4 (analytics) to weeks 5-6
- Phase 2 Task 1 only: case-study post (see Phase 2 rewrite) — drop comparisons, 30 long-tails, README rewrite, templates
- Phase 3 Task 1 only: HN launch — drop PH, Reddit, sponsorships, influencer outreach, SO/GitHub seeding
- Phase 5 Task 1 only: citation tracker daily cron + alerts

**Deferred to post-v1 (weeks 5–10):**
- Phase 1 Task 4 (PostHog+Plausible analytics)
- Phase 2 Tasks 2–5 (3 comparisons, 30 long-tails, README rewrite, templates)
- Phase 3 Tasks 2–5 (PH, Reddit, sponsorships, influencer)
- Phase 4 entire (autonomous pipeline — requires Phase 2 template data to build correctly)
- Phase 5 Tasks 2–6 (leading-indicator dashboard, attribution, eval loop, rolling roadmap)

**v1 deliverables:**
1. #2947 merged
2. MCP server live (`@vertz/docs-mcp` on npm)
3. SSR `<head>` injection + canonical + OG + JSON-LD wired
4. IndexNow + Google Indexing API pinging
5. Citation tracker baseline + daily alerts
6. One case-study post published (transcripts-based, not statistical benchmark — see Phase 2 Task 1)
7. HN launch executed

If all 7 ship in 28 days, the strategy has a shot at Goal 1 (≥1 LLM citation) within the v1 window. Post-v1 phases resume once real data informs template design.

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

### v1 window (28 days)
- **G1:** Vertz cited by ≥1 major LLM (ChatGPT search / Claude web / Perplexity / Gemini) via web retrieval, for at least one query from the target keyword set.
- **G4:** Public MCP docs server (`@vertz/docs-mcp`) installable with one command, live within 2 weeks of v1 start.
- **G6:** HN launch executed (not necessarily front-page — launch itself is the v1 milestone; ranking is stretch).
- **G9 (new):** Citation tracker baseline captured at day 1; daily alert cron running by week 2.

### Post-v1 (weeks 5–10)
- **G2:** First organic inbound traffic from LLM referrers (`chatgpt.com`, `claude.ai`, `perplexity.ai`, `gemini.google.com`) within 6 weeks, measurable in analytics.
- **G3:** Autonomous content pipeline producing ≥3 high-quality posts/week with ≤10 minutes of human approval each, within 10 weeks.
- **G5:** Rank top 10 on Google for 10+ long-tail queries within 10 weeks. (Original "top 3 within 6 weeks" was flagged by reviewer as unrealistic for DA-0 domain; relaxed to "top 10" and timeline extended.)
- **G7:** 1+ third-party mention (influencer, podcast, newsletter) within 8 weeks. (Reduced from 3 — budget doesn't allow sponsorships; must be organic.)
- **G8:** 300+ GitHub stars added within 10 weeks. (Reduced from 1,000 — more honest for organic-only.)

### Business outcome (post-v1)
- **BO1:** 20+ sign-ups / scaffold-runs / first-install events per week attributable to organic discovery within 10 weeks. (Reduced from 50 — reviewer flagged original as under-supported by any conversion model.)
- **BO2:** At least one inbound community or contributor lead per month within 10 weeks.

## Budget

**Hard ceiling: $200/month total** (API spend + any paid distribution + tooling).

| Line item | Budget | Notes |
|---|---|---|
| Citation tracker (weekly, not daily) | $20/mo | 12 queries × 4 providers × 4 weeks ≈ 200 API calls/mo with web search. Weekly cadence is sufficient for trend detection at low content volume. |
| Case-study benchmark (one-time, v1 only) | $80 one-time | 3–5 tasks × 2 frameworks × 5 runs × Claude Sonnet = ~50 LLM sessions. Full transcripts published. |
| Docs index rebuild (MCP package prepublish) | <$5/mo | Bundled during npm publish. |
| Pipeline (post-v1 only, if built) | $80/mo | If/when Phase 4 ships, use Sonnet for drafts + Haiku for validator/reviewer — keeps pipeline under $20/week for 3 posts. |
| Newsletter sponsorships | **$0** | Out of budget. Deferred indefinitely unless budget grows. |
| Paid ads | **$0** | Not in scope. |

**Budget constraints rule out two original assumptions:**
1. Statistical benchmark ($1,500–$10,000 for n≥20 × 4 LLMs × 4 frameworks) is impossible. Phase 2 Task 1 is rewritten as a "radical transparency case study" — qualitative, fewer runs, full transcripts published, no statistical claims. See Phase 2 Task 1.
2. Newsletter sponsorships ($5–10k for Bytes/JS Weekly/TLDR) are impossible. Distribution is 100% organic: HN, GitHub, dev.to/Hashnode cross-posts, GitHub Discussions.

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
| **2. One way to do things** | **Partial honesty:** Content has one canonical home (`vertz.dev/blog`), one authoritative source per topic, cross-posts always link back. Distribution is the one place ambiguity is explicitly accepted — different channels need different framings (HN title ≠ Reddit title ≠ X thread). We trade principle 2 strictness for audience fit on distribution only. Flagged in adversarial review as a violation; we're admitting it instead of denying it. |
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

### Acceptance thresholds at 4 weeks (v1)
- [ ] #2947 merged to main
- [ ] `@vertz/docs-mcp` published to npm, installable via `npx @vertz/docs-mcp`
- [ ] SSR `<head>` injection live — canonical + OG + JSON-LD on every blog post
- [ ] IndexNow + Google Indexing API pinging on deploy
- [ ] Case-study post published with full transcripts committed to `benchmarks/`
- [ ] HN launch executed (rank irrelevant — execution + authenticity of discussion is the v1 bar)
- [ ] Citation tracker baseline committed + daily alert cron running
- [ ] ≥1 LLM citation observed for any query in the tracker (stretch goal — not guaranteed in 4 weeks)

### Acceptance thresholds at 10 weeks (full scope)
- [ ] ≥1 test query returns Vertz citation in ≥2 of 4 LLMs (ChatGPT, Claude, Perplexity, Gemini)
- [ ] ≥10 long-tail queries ranking top 10 on Google (relaxed from top-3 per reviewer)
- [ ] ≥10 third-party backlinks from DA 30+ sites
- [ ] ≥8 blog posts published (not 15 — more honest cadence given single-owner constraint)
- [ ] ≥300 GitHub stars net gained
- [ ] ≥500 weekly unique visitors to vertz.dev
- [ ] Autonomous pipeline producing ≥3 posts/week for 2 consecutive weeks (only if Phase 4 has shipped)

---

## Stop Conditions

Every strategy needs a pre-committed failure mode — otherwise every result justifies continuation. These are the numbers that, if breached, trigger a mandatory pause and root-cause analysis. Named **before** execution starts so future-self can't move goalposts.

### Stop 1 — Retrieval mechanism is dead
- **Metric:** Citation tracker cells with Vertz mention (of 48 total: 12 queries × 4 providers, weekly run)
- **Threshold:** 0 mentions for **4 consecutive weeks** after Phase 2 Task 1 (case study post) ships
- **Action:** Pause all content work. 1-week root-cause analysis. If root cause is framework correctness (LLM generates wrong Vertz code), pause entire strategy and fix framework first.

### Stop 2 — Authority isn't building
- **Metric:** Unique sessions per week from LLM referrers (`chatgpt.com` + `claude.ai` + `perplexity.ai` + `gemini.google.com`)
- **Threshold:** <10 sessions/week sustained through **week 8** (month 2)
- **Action:** Revisit ranking hypothesis. Either content isn't surfacing or topics aren't drawing intent. Before shipping more content, audit what's been published vs. what's been indexed vs. what LLMs cite.

### Stop 3 — Pipeline quality is drifting (only applies if Phase 4 ships)
- **Metric:** % of autonomous-pipeline drafts rejected at human approval gate
- **Threshold:** ≥50% rejection rate for **2 consecutive weeks**
- **Action:** Pause pipeline. Run eval loop against golden set (Phase 5 Task 4). Tune prompts. Do not re-enable pipeline until eval scores return to baseline.

### Stop 4 — Nuclear (strategy-level)
- **Metric:** Qualified leads (enterprise contacts, contributor PRs, community signups) attributable to organic discovery
- **Threshold:** 0 qualified leads in **12 consecutive weeks** despite green Stop 1 and Stop 2 metrics
- **Action:** Strategy is not producing business outcomes. Pivot to a different channel (paid, outbound sales, community partnerships) or reposition entirely. Organic SEO/GEO is not the answer for this product at this stage.

**All stop conditions must include the specific review date when breached.** Breaching a condition does NOT mean "obviously fail and abandon" — it means mandatory pause before next action. Breached conditions are written into `reviews/geo-seo-strategy/stop-log.md` with date + root-cause hypothesis + decision.

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

### v1 (28-day window)

| Phase | Slug | Duration | v1 Scope |
|---|---|---|---|
| **0** | `phase-00-prerequisites.md` | Days 1–3 | Merge #2947 (blog infra) to main. Everything else depends on this. |
| **1** | `phase-01-foundation-infra.md` | Days 3–14 | MCP server live. SSR head injection. IndexNow. Citation tracker baseline. **Defer Task 4 (analytics) to post-v1.** |
| **2** | `phase-02-ignition-content.md` | Days 7–21 | Task 1 only: case-study post (3–5 tasks, full transcripts, <$80 API). **Defer Tasks 2–5 to post-v1.** |
| **3** | `phase-03-distribution-blitz.md` | Days 21–28 | Task 1 only: HN launch. **Defer Tasks 2–5 (PH, Reddit, sponsorships, outreach, SO/GH) to post-v1.** |
| **5** | `phase-05-measurement-iteration.md` | Days 14+ | Task 1 only: citation tracker weekly cron + alerts. **Defer Tasks 2–6 to post-v1.** |

Phase 4 (autonomous pipeline) is **entirely deferred** from v1. Per adversarial review: templates need real post-performance data before automating; rushing this produces a pipeline that generates low-quality content under a human byline (manifesto violation M1).

### Post-v1 (weeks 5–10)

Remaining tasks from Phases 1–5 plus all of Phase 4. Ordered by what v1 data tells us works. Examples of likely ordering (to be confirmed at week 4 retro):

1. Phase 2 comparison posts (informed by which case-study framings resonated)
2. Phase 3 organic distribution (Reddit, GitHub Discussions, influencer outreach — no sponsorships per budget)
3. Phase 1 Task 4 analytics (PostHog + Plausible)
4. Phase 5 Tasks 2–6 (leading indicators, attribution, evals)
5. Phase 4 autonomous pipeline (with AI-authorship byline disclosed — see Phase 4 revisions)
6. Phase 2 Tasks 3–5 (30 long-tails, README rewrite, templates)

---

## Definition of Done (v1)

- [ ] Phase 0 + v1-scope tasks of Phases 1, 2, 3, 5 complete with acceptance tests passing
- [ ] 4-week v1 acceptance thresholds met (see Success Metrics)
- [ ] Retrospective written in `plans/post-implementation-reviews/geo-seo-strategy-v1.md`
- [ ] Citation tracker running weekly with committed baseline
- [ ] Decision made on whether to proceed to post-v1 scope based on v1 data

## Definition of Done (full scope, post-v1)

- [ ] All phases (0–5) complete
- [ ] 10-week acceptance thresholds met
- [ ] At least 1 LLM cites Vertz via web retrieval for a targeted query (measured by citation tracker)
- [ ] No stop condition breached without documented resolution
- [ ] If Phase 4 shipped: pipeline posts carry visible `author: autonomous-pipeline (reviewed by Matheus)` byline (manifesto M1 compliance)

---

## Resolved questions (from v1 review)

These were open in v1; answered during adversarial review on 2026-04-22:

1. **Budget commitment:** $200/month hard cap. No newsletter sponsorships. Organic only.
2. **MCP server scope:** Docs + API reference + example links only. No playground queries in v1 (ship faster).
3. **Approval gate ownership:** Matheus solo for v1. Revisit when Phase 4 ships.
4. **Content pipeline tech choice:** Standalone TS script for v1. Dogfood on Vertz itself only if Phase 4 ships with a clear Vertz showcase narrative.
5. **Launch ordering:** HN only in v1. Other channels deferred to post-v1.
6. **Anthropic relationship:** Not pursued actively. Explore opportunistically if natural moments arise (e.g., MCP launch coincides with a Claude Code feature).

## Still open (must decide before execution of relevant phase)

- **Benchmark case-study scope:** 3 tasks or 5 tasks? (See Phase 2 Task 1.) Each task = ~$15 API + 1 day of work.
- **Who reviews the case study methodology externally?** The adversarial reviewer recommended a respected non-Vertz engineer validates the task selection + transcripts. Candidates: Sebastian Markbåge, Jarred Sumner, Theo Browne, Daniel Ehrenberg. Decide + reach out before Phase 2 starts.
- **Stop condition calibration:** Current thresholds are reviewer-proposed. Matheus should adjust based on his read of what's realistic before committing.
