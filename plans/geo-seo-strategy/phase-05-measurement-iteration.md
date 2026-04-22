# Phase 5: Measurement & Iteration

## Context

The first four phases build and launch. This phase makes sure we actually know what's working — and closes the loop by feeding signals back into the pipeline. Without this phase, Phase 4 is a content factory with no quality control; without the dashboards in Phase 1 Task 5, we're flying blind on whether any of this actually drove LLM citations.

This phase is mostly ongoing operations + a small amount of tooling to make those operations sustainable.

**Main design doc:** `plans/geo-seo-strategy.md`

**Depends on:** Phase 1 (analytics + citation tracker already baseline) + Phase 3 (real distribution data to measure) + Phase 4 (pipeline running)

**Duration:** 7 days of tooling, then ongoing

---

## Tasks

### Task 1: Citation tracker daily cron + alerting

**Why:** Phase 1 shipped the baseline script. This turns it into a daily automated run with alerting so we notice wins (and losses) within 24h, not at monthly review.

**Files:** (4)
- `.github/workflows/citation-tracker.yml` (new) — daily 6am BRT cron, runs script, commits CSV to private repo
- `scripts/citation-tracker/alert.ts` (new) — diff today's run vs yesterday, Slack alert on new citations OR regressions
- `scripts/citation-tracker/history-plot.ts` (new) — weekly chart generator (citations per provider over time)
- `~/vertz-dev/dashboards/citation-tracker.md` (new, generated) — weekly human-readable summary

**What to implement:**

Workflow runs daily:
1. Execute citation tracker from Phase 1 Task 5
2. Compare with yesterday's CSV
3. Compute diff:
   - New citations (previously 0, now 1+)
   - Lost citations (previously 1+, now 0)
   - Citation rate per provider (% of 20 queries with mentions)
4. If any new citation OR any regression: post Slack alert immediately
5. Commit CSV + generated plot to `vertz-dev/citation-tracker` private repo
6. Update weekly `citation-tracker.md` dashboard every Monday

Alert format:
```
🎯 Citation tracker – 2026-04-29

New this run:
  ✅ ChatGPT cited vertz.dev for "typescript framework for llm code generation"

Lost this run:
  (none)

Current overall rate: 12/80 (15%) ↑ from 8/80 last week
By provider:
  ChatGPT: 4/20 (20%)
  Claude: 5/20 (25%)
  Perplexity: 2/20 (10%)
  Gemini: 1/20 (5%)
```

**Acceptance criteria:**
- [ ] Cron runs daily, uploads CSV to private repo
- [ ] Diff computation correct (tested with seeded pairs)
- [ ] Slack alert fires on new citation (verified with manual diff)
- [ ] Slack alert fires on regression
- [ ] Weekly chart committed automatically every Monday
- [ ] Dashboard markdown file readable at a glance — manager could review in 2 minutes

---

### Task 2: Leading-indicator dashboard

**Why:** Citation tracker is the lagging ground truth. Leading indicators tell us days-weeks earlier whether the strategy is working. Catches problems before the citation tracker confirms them.

**Files:** (4)
- `scripts/dashboards/leading-indicators.ts` (new) — pulls GSC + PostHog + GitHub + npm + Ahrefs
- `scripts/dashboards/render.ts` (new) — renders to markdown + HTML
- `~/vertz-dev/dashboards/leading-indicators.md` (new, generated weekly)
- `scripts/dashboards/README.md` (new) — how to read the dashboard, what each metric means

**What to implement:**

Pulls weekly:
- **GSC**: impressions, clicks, CTR, average position for top 50 queries
- **PostHog**: unique visitors, `llm_referrer` events by source, `doc_search` events, scroll-depth on blog posts
- **GitHub**: stars gained, repo traffic (views, unique visitors, referrers)
- **npm**: weekly downloads of `vertz`, `@vertz/docs-mcp`, `@vertz/*`
- **Ahrefs** (if paid) or manual check: new referring domains, backlinks

Computed metrics:
- Weekly GSC click-through rate trend
- LLM referrer % of total traffic (leading indicator for Goal 1)
- GitHub star velocity (stars/day, 7-day moving avg)
- `@vertz/docs-mcp` weekly downloads (leading indicator for MCP adoption)
- New referring domains per week

Output: single markdown file with week-over-week comparisons, flagged ⬆️/⬇️ deltas.

**Acceptance criteria:**
- [ ] Dashboard generated every Monday at 9am BRT
- [ ] Week-over-week deltas rendered for each metric
- [ ] `llm_referrer` traffic broken out by source (ChatGPT, Claude, Perplexity, Gemini, other)
- [ ] Dashboard committed to `~/vertz-dev/dashboards/` and posted to Slack
- [ ] Matheus can scan it in <3 minutes and know "am I winning"

---

### Task 3: Weekly retro cadence

**Why:** Metrics without reflection don't change behavior. A fixed ritual ensures we ask: "what worked, what didn't, what do we change?"

**Files:** (2)
- `plans/post-implementation-reviews/geo-seo-weekly-retros.md` (new, ongoing) — single rolling file
- `scripts/retro-template.sh` (new) — helper: appends a new week's retro template

**What to implement:**

Every Monday at 10am BRT, 30-minute ritual:
1. Read citation tracker dashboard (from Task 1)
2. Read leading-indicator dashboard (from Task 2)
3. Read pipeline output log from the week (which posts, which rankings)
4. Answer 4 questions:
   - What moved? (which metric changed most)
   - What didn't move that we expected to? (surprises)
   - What did we learn about what resonates?
   - What do we change this week in: topic picker signals / writer prompts / distribution?

Append to rolling retro file:
```md
## Week of 2026-04-28

### Moved
- `@vertz/docs-mcp` downloads: 47 → 312 (↑ 563%). HN launch + benchmark post combined.

### Didn't move
- Perplexity citations still 0. Schema markup may need adjustment.

### Learned
- "vs tRPC" post converted 3x higher than "vs Next.js" — TS community deeply bought into tRPC, comparison is more resonant.

### Changing
- Topic picker: weight comparison-format higher this week
- Writer: add stronger "when NOT to use Vertz" section (reviewer agent: enforce)
- Distribution: draft a "vs Drizzle + Hono" post (same resonance class)
```

**Acceptance criteria:**
- [ ] Retro happens every Monday for at least 6 weeks
- [ ] Each retro produces at least 1 concrete change to the pipeline
- [ ] Changes are tracked to resolution in the next retro (did it work?)
- [ ] Retro file committed to repo (permanent record, kills "we already tried that" amnesia)

---

### Task 4: Pipeline quality tuning loop

**Why:** The autonomous pipeline has agents with prompts that need tuning. Without systematic tuning, drift accumulates — each week the output gets slightly worse, slowly, until we notice only when it's bad. Systematic tuning prevents this.

**Files:** (3)
- `scripts/content-pipeline/evals/golden-set.json` (new) — 10 manually-graded posts as baseline
- `scripts/content-pipeline/evals/run-evals.ts` (new) — runs writer + reviewer on golden set, scores drift
- `scripts/content-pipeline/evals/report.md` (new, generated) — weekly eval report

**What to implement:**

Golden set:
- 10 posts (5 already-shipped, 5 held-out) with human-graded scores per dimension:
  - Manifesto alignment: 0-10
  - Factual accuracy: 0-10
  - Voice fidelity: 0-10
  - Technical depth: 0-10
  - Hook strength: 0-10

Eval script:
- Runs writer with same prompts on 5 held-out topics
- Runs reviewer on all 10 posts (5 shipped, 5 newly generated)
- Compares reviewer scores to human scores → drift metric
- Compares writer output today vs writer output from prompt version N-1 → regression metric

Tuning triggers:
- Drift > 15% → reviewer prompt needs recalibration
- Regression > 10% week-over-week on writer → system prompt or MCP context may have changed; investigate

Weekly eval report in `evals/report.md` with verdict: "green (no changes), yellow (investigate), red (pause pipeline, debug)."

**Acceptance criteria:**
- [ ] Golden set of 10 posts with human grades exists
- [ ] Eval script runs in <10 minutes, fits in weekly retro loop
- [ ] Drift + regression metrics computed and tracked
- [ ] Red verdict triggers Slack alert + pipeline pause
- [ ] Pipeline never silently degrades without catching it

---

### Task 5: Referrer-based attribution model

**Why:** Traffic alone doesn't say "is this piece of content converting?" We need to know which posts / channels actually drive installs, stars, and leads. Without this, we optimize the wrong things.

**Files:** (3)
- `packages/landing/src/analytics/attribution.ts` (new) — captures referrer + UTM + landing page on every session
- `scripts/dashboards/attribution.ts` (new) — builds per-post conversion funnel
- `~/vertz-dev/dashboards/attribution.md` (new, generated weekly)

**What to implement:**

Attribution model:
- Session starts: capture `{referrer, utm_source, utm_medium, utm_campaign, landing_url}`
- Store in PostHog as `session_source`
- Track conversions downstream: `github_star_click`, `mcp_install_copied`, `npm_install_copied`, `github_repo_click`, `contact_form_submit`

Conversion funnel per post:
```
/blog/<slug>
  sessions: 1,240
  → scrolled >50%: 840 (68%)
  → clicked GitHub: 120 (9.7% of sessions)
  → clicked MCP install: 87 (7%)
  → clicked npm install: 156 (12.6%)
```

By referrer source:
- ChatGPT: 45 sessions, 8% conversion
- HN: 4,200 sessions, 3.2% conversion (high volume, low intent)
- dev.to: 890 sessions, 4.8% conversion
- Direct/bookmark: 620 sessions, 11% conversion (highest intent)

Attribution report weekly: "top converting posts, top converting channels, dying content."

**Acceptance criteria:**
- [ ] Attribution captured on 100% of sessions (0 null `session_source`)
- [ ] Per-post conversion funnels computed weekly
- [ ] Per-channel conversion rates computed weekly
- [ ] At least 1 actionable insight per week feeds into retros (e.g., "kill post X, double down on format Y")

---

### Task 6: Rolling 90-day roadmap maintained

**Why:** The strategy must evolve as data comes in. A static plan rots. We commit to maintaining a living 90-day roadmap that reflects what we learned.

**Files:** (1)
- `plans/geo-seo-strategy/rolling-roadmap.md` (new) — living document, updated weekly

**What to implement:**

Structure:
```
# Rolling 90-day roadmap

Last updated: YYYY-MM-DD

## This week (Mon start)
- [ ] ...

## Next week
- [ ] ...

## Weeks 3-4
- [ ] ...

## Quarter goals (review monthly)
- [ ] ...

## Deprioritized (note why)
- ~~X~~ — low conversion in week-5 data
```

Updated every Monday retro. Items pulled from:
- Retros ("changing" section)
- Dashboard deltas
- New opportunities (e.g., new LLM launches, new awesome-list categories)
- Deprioritized items that stopped being worth it

**Acceptance criteria:**
- [ ] File exists and is updated every Monday
- [ ] Each week, at least one item deprioritized with a reason (forces discipline)
- [ ] Quarter goals reviewed at end of month, revised if needed
- [ ] File is single source of truth — if it's not here, we don't owe it

---

## Dependencies

```
Task 1 (citation cron + alerts)   ─── depends on Phase 1 Task 5 baseline
Task 2 (leading dashboard)        ─── depends on Phase 1 Task 4 analytics
Task 3 (retro cadence)            ─── starts week after Phase 3 completes
Task 4 (pipeline tuning)          ─── depends on Phase 4 running 2+ weeks
Task 5 (attribution)              ─── depends on Phase 1 analytics infrastructure
Task 6 (rolling roadmap)          ─── starts day 1, updated weekly thereafter
```

## Done when

- [ ] All 6 tasks' acceptance criteria checked
- [ ] 6 consecutive weeks of Monday retros completed
- [ ] At least 1 observed citation in LLM results matched to an attribution-traced outcome
- [ ] Pipeline tuning loop has triggered at least 1 prompt adjustment with measured improvement
- [ ] Quarterly review scheduled (evaluate whether to continue, double down, or pivot)
- [ ] Phase review file written at `reviews/geo-seo-strategy/phase-05-measurement-iteration.md` by a different agent

---

## Exit criteria — when to declare "the system is working"

This phase doesn't "complete" in a traditional sense — it's operational. But we can declare Goal 1 achieved when:

- [ ] ≥25% citation rate across 4 LLMs (20+ mentions per run of 80 cells), sustained 3 consecutive weeks
- [ ] ≥15% of new sessions come from LLM referrers (`chatgpt.com`, `claude.ai`, `perplexity.ai`, `gemini.google.com`), sustained 2 weeks
- [ ] Autonomous pipeline has produced ≥20 published posts with ≤10 min/post human time
- [ ] At least 3 inbound community or enterprise leads attributable to organic discovery

At that point, this feature converts from "active build" to "steady-state operations." Further growth comes from scaling (more posts/week, more channels, more languages) rather than building the machine.
