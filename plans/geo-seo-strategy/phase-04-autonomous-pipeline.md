# Phase 4: Autonomous Content Pipeline

## Context

Phases 2 and 3 do not scale — they require Matheus + Claude pair-writing every piece. For organic growth to compound, content must produce itself. This phase builds the multi-agent pipeline that turns a weekly cron trigger into 3–5 publish-approved posts per week with ≤10 minutes of human time per post.

The pipeline is built on Vertz itself (`@vertz/agents`) — dogfood value is high, and the pipeline's existence becomes a Vertz case study.

**v1 status: ENTIRELY DEFERRED.** Per adversarial review (technical feasibility + manifesto): (a) 11 days for 7-agent pipeline is not feasible alongside HN launch in same window, (b) templates need to be grounded in real v1 post performance before automating, (c) publishing AI-written content under a human byline violates Principle 3 (identity laundering). This phase resumes in weeks 5–10 post-v1, with the mandatory revisions below.

**Mandatory revisions before Phase 4 ships (from adversarial review M1):**
1. **Visible AI-authorship byline** on every pipeline-produced post: `author: autonomous-pipeline (reviewed by Matheus)`. Readers must know a post was machine-drafted.
2. **No first-person "I" or "we" impersonation of Matheus** in writer prompt. Drop the "Persona: Matheus Poleza" instruction. Writer agent persona is: "an informed but neutral technical writer, no first-person voice unless the source material explicitly quotes Matheus or another named human."
3. **Reviewer-agent-self-grading is not sufficient quality control.** Phase 5 Task 4 (golden-set eval) is a dependency, not a nice-to-have. Reviewer agent drift is measured weekly, not quarterly.
4. **Alternative if manifesto compliance feels too constraining:** restrict pipeline output to the `/answer/*` long-tail surface where Q&A format makes the machine origin obvious. Blog surface stays human-written. This is the safer manifesto-aligned path.

**Main design doc:** `plans/geo-seo-strategy.md`

**Depends on:** Phase 2 (templates extracted from seed content, including real post performance data) + Phase 1 (analytics for topic picker to read) + Phase 5 Task 4 (golden-set eval)

**Duration:** 11 days, starting post-v1 (week 5+)

---

## Tasks

### Task 1: Orchestrator + topic picker agent

**Why:** The whole pipeline hinges on topic selection. Bad topics = wasted Claude API budget and diluted site authority. Good topics = every post ranks for a real query devs ask.

**Files:** (5)
- `scripts/content-pipeline/orchestrator.ts` (new) — main entry, runs full pipeline per week
- `scripts/content-pipeline/agents/topic-picker.ts` (new) — topic selection agent
- `scripts/content-pipeline/signals/gsc.ts` (new) — Google Search Console API wrapper (pulls queries with impressions but no clicks)
- `scripts/content-pipeline/signals/github-issues.ts` (new) — reads open issues tagged `content`
- `scripts/content-pipeline/state/db.ts` (new) — SQLite (via `@vertz/db`) storing past topics, topics-shipped, blocked-topics

**What to implement:**

Orchestrator entry:
```ts
// scripts/content-pipeline/orchestrator.ts
import { topicPicker } from './agents/topic-picker';
// (writer, validator, reviewer, publisher imported in later tasks)

export async function runWeekly() {
  const topics = await topicPicker({ count: 5 });
  // emit Slack message with topics for human approval (Task 6)
  // ... downstream stages added in later tasks
}
```

Topic picker agent:
- Pulls signals:
  - GSC queries: impressions >10, clicks 0, position <20 in last 28 days (content gap — almost ranking, needs a dedicated page)
  - GitHub issues tagged `content` that are not yet addressed
  - Semrush keyword research (optional; see Task 6)
  - PostHog `doc_search` events with no matching doc page
- Combines signals with Claude:
  - Input: signals + existing post list + template formats + manifesto
  - Output: 5 candidate topics with {slug, format, keyword, estimatedLength, hook}
- Deduplicates against `content_state.shipped_topics` table
- Ranks by expected impact (traffic potential × fit with Vertz positioning)

State DB schema (via Vertz `@vertz/db`):
```ts
import { d } from '@vertz/db';

export const topic = d.table('topic', {
  id: d.string().primary(),
  slug: d.string(),
  format: d.enum(['comparison', 'gotcha', 'tutorial', 'opinion']),
  keyword: d.string(),
  status: d.enum(['proposed', 'approved', 'drafted', 'published', 'rejected']),
  proposedAt: d.timestamp(),
  publishedAt: d.timestamp().nullable(),
});
```

**Acceptance criteria:**
- [ ] Running `bun run scripts/content-pipeline/orchestrator.ts` produces 5 topic candidates with full metadata
- [ ] Topic picker never proposes duplicates (verified via test with seeded history)
- [ ] Each topic has: slug, format, primary keyword, hook, expected length, source signal (which of GSC/issues/analytics)
- [ ] GSC auth works via service account (same credentials as Phase 1 Task 3)
- [ ] State DB is a local SQLite file (not the prod DB) — runs offline-capable
- [ ] Unit tests cover: signal merging, dedup, ranking, output format

---

### Task 2: Writer agent

**Why:** The writer is the creative engine. Its output quality determines whether the pipeline is viable or gets abandoned. Must produce drafts humans would approve with minor edits, not complete rewrites.

**Files:** (4)
- `scripts/content-pipeline/agents/writer.ts` (new) — writer agent, one per approved topic
- `scripts/content-pipeline/prompts/writer-system.md` (new) — system prompt with voice guidelines from manifesto
- `scripts/content-pipeline/prompts/writer-{format}.md` (new, 4 files) — per-format prompts (comparison/gotcha/tutorial/opinion)
- `scripts/content-pipeline/agents/__tests__/writer.test.ts` (new) — contract tests for output shape

**What to implement:**

Writer agent receives: `{topic, format, targetLength, hook}` + context via MCP to Vertz docs.

System prompt key points:
- Persona: Matheus Poleza, founder of Vertz, first-person voice, direct, no marketing fluff
- Constraints:
  - Only claim what's testable. Link to evidence for every factual claim.
  - No hype words: "revolutionary", "game-changing", "seamlessly", "effortlessly", "best-in-class"
  - Use active voice, short sentences, code-first
  - Target Flesch reading ease ≥60 (college-level max)
- Format follow: match the exact template from Phase 2 Task 5

Per-format prompts have specific instructions:
- **Comparison**: TL;DR table in first 300 words. Side-by-side code. Acknowledge where competitor wins.
- **Gotcha**: error string verbatim in H1. Fix in first 300 words. Why section is last, not first.
- **Tutorial**: end result in first 200 words. Numbered steps. Every snippet compiles.
- **Opinion**: stance in H1. One piece of evidence per paragraph. Name the counterargument.

Writer output:
```ts
{
  frontmatter: { title, slug, date, author, tags, description, cover },
  body: string, // MDX
  metadata: {
    suggestedOgTitle: string,
    suggestedOgDescription: string,
    estimatedReadingMinutes: number,
    runnableSnippets: Array<{ language: string, code: string, filePath: string }>,
  }
}
```

**Acceptance criteria:**
- [ ] Writer produces valid MDX with complete frontmatter
- [ ] Writer produces `runnableSnippets` array for Task 3 (validator) to consume
- [ ] Writer prompt bans marketing fluff words (test: feed known-fluffy topic, assert no banned words in output)
- [ ] Writer reads Vertz docs via MCP when topic needs API specifics (test: topic mentions "signals", writer calls `search_docs("signals")`)
- [ ] Manual blind test: 3 drafts reviewed by Matheus, ≥2 are approve-with-minor-edits (not full rewrite)

---

### Task 3: Code validator agent

**Why:** Broken snippets in a published post destroy trust instantly. Manifesto principle #1: "If it builds, it works." The validator enforces this.

**Files:** (4)
- `scripts/content-pipeline/agents/code-validator.ts` (new) — extracts and validates every snippet
- `scripts/content-pipeline/sandbox/runner.ts` (new) — creates temp Vertz project, runs `vtz test` + `vtz run typecheck` on snippets
- `scripts/content-pipeline/sandbox/template-project/` (new) — pre-built Vertz scaffold used as validation base
- `scripts/content-pipeline/agents/__tests__/code-validator.test.ts` (new) — test snippets expected pass/fail

**What to implement:**

Validator pipeline:
1. Receive draft with `runnableSnippets`
2. For each snippet:
   - Write to a temp file in the sandbox template project
   - Run `vtz run typecheck` — capture errors
   - If snippet has test assertions (declared via triple-backtick metadata), run `vtz test` for that file
3. Aggregate results: `{snippet, status, errors}`
4. If any fail:
   - Return to writer with errors as feedback
   - Max 3 retry loops
   - If still failing after 3: escalate to human (Slack notify)

Sandbox template project:
- Pre-scaffolded Vertz app with: entities, services, UI components, auth
- Isolated per pipeline run (copy, not shared — prevents contamination)
- Node_modules cached in monorepo CI to avoid re-install cost (~60s/run otherwise)

Snippet marking convention (writer emits, validator respects):
```mdx
```ts title="src/entities/task.ts" runnable
import { d } from '@vertz/db';

export const task = d.table('task', { ... });
```
```

`runnable` flag means "validator must check this." Untagged snippets (partial fragments, pseudo-code) are skipped with a warning but don't block.

**Acceptance criteria:**
- [ ] Validator correctly rejects snippets with type errors (tested with seeded broken code)
- [ ] Validator correctly accepts compiling snippets
- [ ] Feedback loop works: writer revises, validator re-runs, eventually passes
- [ ] Escalation to human when retries exhausted (Slack message with failed snippets)
- [ ] Sandbox isolation: one pipeline run can't affect another's sandbox
- [ ] Single snippet validation runs in <20s (cache warm)

---

### Task 4: Reviewer agent

**Why:** Adversarial review catches weak content before it ships. Phase 4's reviewer replicates the phase-review discipline already used for code. Human approval stays the final gate, but reviewer filters so human only sees substantive drafts.

**Files:** (3)
- `scripts/content-pipeline/agents/reviewer.ts` (new) — adversarial reviewer
- `scripts/content-pipeline/prompts/reviewer-system.md` (new) — review criteria as explicit checklist
- `scripts/content-pipeline/agents/__tests__/reviewer.test.ts` (new) — regression tests with known-weak and known-strong sample posts

**What to implement:**

Reviewer checklist (prompt-encoded):
1. Manifesto alignment: every claim testable, no fluff words, voice matches
2. Factual accuracy: spot-check 3 claims, flag if unsourced
3. SEO basics: H1 matches frontmatter title, meta description ≤160 chars, one primary keyword used 3-5 times naturally, canonical set
4. Template fidelity: matches the format template from `content/templates/`
5. Unique angle: at least one claim or piece of evidence not found in existing content (search existing posts + docs)
6. Runnable code: `runnableSnippets` array is non-empty for tutorials/comparisons; matches "If you can't test it, don't build it"
7. Demo-ability: has a link to a live demo, CodeSandbox, or github example for tutorials/comparisons

Output:
```ts
{
  verdict: 'approve' | 'revise' | 'reject',
  findings: Array<{
    severity: 'blocker' | 'should-fix' | 'nit',
    area: 'manifesto' | 'facts' | 'seo' | 'template' | 'angle' | 'runnable' | 'demo',
    description: string,
    suggestedFix: string,
  }>,
  score: number, // 0-100
}
```

- `approve` if score ≥85 and no blockers
- `revise` if blockers exist → return to writer with findings
- `reject` if score <50 → escalate to human, don't retry (topic likely flawed)

**Acceptance criteria:**
- [ ] Reviewer identifies fluff words in known-fluffy samples (tested with deliberately-bad draft)
- [ ] Reviewer approves the 7 Phase 2 ignition posts (tested with already-shipped drafts)
- [ ] Reviewer blocks drafts with no runnable code in tutorial format
- [ ] Reviewer produces findings with specific suggestedFix strings (not vague)
- [ ] Reviewer score correlates with human scoring on 10 sample drafts (r ≥ 0.7)

---

### Task 5: Publisher agent

**Why:** Publishing across 4+ channels manually is 30 minutes per post. Automating it closes the loop between "approved" and "live everywhere."

**Files:** (4)
- `scripts/content-pipeline/agents/publisher.ts` (new) — main publisher
- `scripts/content-pipeline/channels/devto.ts` (new) — dev.to API publish with canonical
- `scripts/content-pipeline/channels/hashnode.ts` (new) — Hashnode GraphQL publish with canonical
- `scripts/content-pipeline/channels/x-linkedin-drafts.ts` (new) — emits X thread + LinkedIn post drafts to Slack (manual send, platforms rate-limit bots)

**What to implement:**

Publisher flow:
1. Receive approved draft (MDX + metadata)
2. Commit to feature branch: `feat/blog-<slug>` with the MDX file
3. Open PR to main (auto-merge if CI passes, else hold for manual)
4. On main merge (or direct push if auto-merge enabled):
   - Wait for Cloudflare deploy to succeed (poll deploy API)
   - Trigger IndexNow + Google Indexing API for the new URL (Phase 1 Task 3)
   - Cross-post to dev.to with `canonical_url` pointing to vertz.dev/blog/<slug>
   - Cross-post to Hashnode with canonical
   - Generate X thread draft (6-8 tweets, first = hook, last = link), post to Slack for Matheus to send
   - Generate LinkedIn post draft, post to Slack
   - Create GitHub Discussion excerpt with "full post at vertz.dev/blog/<slug>"
   - Log to tracking sheet: `{slug, publishedAt, channels, referrerUrl}`

Cross-post format rules:
- dev.to: append `> This post originally appeared on [vertz.dev/blog/<slug>](...)` at end
- Hashnode: canonical in frontmatter + visible link back
- X thread: auto-generated but with "DRAFT — send manually" warning; human sends from personal account
- LinkedIn: same, draft only

Rationale for X/LinkedIn as drafts: (1) both platforms ban obvious automation, (2) personal voice converts better than bot voice, (3) cost of 3 minutes of human effort is worth the authenticity.

**Acceptance criteria:**
- [ ] Publisher commits MDX to branch + opens PR
- [ ] After merge, URL goes live + IndexNow ping fires
- [ ] dev.to cross-post has correct canonical back-link
- [ ] Hashnode cross-post has correct canonical back-link
- [ ] X + LinkedIn drafts delivered to Slack with preview
- [ ] GitHub Discussion created
- [ ] Tracking sheet updated with publish metadata
- [ ] Rollback plan: if a post needs unpublish, `scripts/content-pipeline/unpublish.ts <slug>` removes across all channels

---

### Task 6: Human approval UI (Slack integration)

**Why:** Human gates at topic-approval and publish-approval are the pipeline's quality firewall. They must be faster than writing the content (else the pipeline is not a win).

**Files:** (3)
- `scripts/content-pipeline/slack/bot.ts` (new) — Slack bot app, handles approval flows
- `scripts/content-pipeline/slack/messages.ts` (new) — message formatters
- `scripts/content-pipeline/slack/README.md` (new) — setup instructions for Slack App + bot token

**What to implement:**

Topic approval message:
```
🤖 Content pipeline: 5 topic candidates this week

1. [comparison] Vertz vs Hono for edge functions
   Keyword: "typescript framework cloudflare workers type safe"
   Signal: GSC — 47 impressions, 0 clicks, position 18
   [✅ Approve] [❌ Reject] [🔄 More like this]

2. [gotcha] Fix: cannot read property 'signal' of undefined
   Signal: GitHub issue #3012
   [✅ Approve] [❌ Reject] [🔄 More like this]

... (5 total)

Respond with: approve 1,3,4 (or reject all)
```

Publish approval message:
```
🤖 Draft ready: "Vertz vs Hono for edge functions"

Preview: https://preview.vertz.dev/blog/vertz-vs-hono-edge
Reviewer score: 89/100
Validator: all 7 snippets compile ✅

[✅ Approve & publish] [✏️ Request revision] [❌ Reject]
```

Slack interactions → webhook → orchestrator resumes the pipeline.

**Acceptance criteria:**
- [ ] Slack bot installed in vertz workspace with approval command
- [ ] Topic approval flow: human selects, orchestrator resumes with selected topics
- [ ] Publish approval flow: human clicks approve, publisher runs immediately
- [ ] Revision flow: human comments with feedback, writer re-runs with feedback
- [ ] Total human time per post: ≤10 minutes (measured over 3 real posts)

---

### Task 7: Semrush signal integration (optional enhancement)

**Why:** GSC only knows about queries we already rank for somewhat. Semrush exposes the broader keyword universe — including queries competitors rank for that we don't. Makes topic picker meaningfully smarter.

**Files:** (2)
- `scripts/content-pipeline/signals/semrush.ts` (new) — Semrush MCP wrapper
- `scripts/content-pipeline/signals/__tests__/semrush.test.ts` (new) — mocked response tests

**What to implement:**

Uses the existing `semrush` MCP server (tools already available in this workspace):
- `mcp__semrush__keyword_research` — find long-tail queries for seed keywords like "typescript framework", "full stack typescript", "type safe api"
- `mcp__semrush__organic_research` — see what Next.js docs, Remix docs, tRPC docs rank for
- `mcp__semrush__url_research` — see keyword overlap between vertz.dev and competitors

Signal output fed to topic picker:
```ts
{
  queryCandidates: Array<{
    keyword: string,
    searchVolume: number,
    difficulty: number,
    competitors: string[], // top 3 URLs
    ourPosition: number | null, // null if we don't rank
  }>
}
```

Topic picker prioritizes queries with: high volume, low difficulty, competitors are weak (non-authoritative), we don't yet rank.

**Acceptance criteria:**
- [ ] Semrush signal returns ≥20 viable candidates from seed keywords
- [ ] Candidates ranked by expected traffic × feasibility
- [ ] Topic picker's weekly output improves measurably vs GSC-only baseline (fewer duplicates, higher projected traffic per post)

---

## Dependencies

```
Task 1 (orchestrator + picker) ─── starts day 10
Task 2 (writer)                ─── depends on Task 1 + Phase 2 templates
Task 3 (validator)             ─── depends on Task 2 (consumes writer output)
Task 4 (reviewer)              ─── depends on Task 2 + 3 (needs full draft + validated code)
Task 5 (publisher)             ─── depends on Task 4 approval + Phase 1 IndexNow
Task 6 (Slack UI)              ─── depends on Task 1 + Task 5 (entry and exit points)
Task 7 (Semrush)               ─── optional, can be added post-launch
```

Critical path: 1 → 2 → 3 → 4 → 5 → 6. Task 7 is non-blocking, recommended follow-up.

## Done when

- [ ] All 7 tasks' acceptance criteria checked (6 if Task 7 deferred)
- [ ] End-to-end dry run: cron → 5 topics → human approves 3 → 3 drafts → 3 validators pass → 3 reviewers approve → 3 publishes succeed
- [ ] First autonomously-produced post is live on vertz.dev/blog + dev.to + Hashnode
- [ ] Weekly cadence: pipeline runs 2 consecutive weeks, produces 3+ posts/week, human time ≤60 min/week
- [ ] Rollback tested: unpublish works across all channels
- [ ] Cost tracked: Claude API spend <$100/week for 3-5 posts
- [ ] Phase review file written at `reviews/geo-seo-strategy/phase-04-autonomous-pipeline.md` by a different agent
