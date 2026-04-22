# Technical Feasibility Review

- **Reviewer lens:** Principal engineer who must actually build this
- **Agent:** general-purpose (Claude)
- **Date:** 2026-04-22

---

## Tasks that will miss their time estimate

**Phase 1 Task 1 — `@vertz/docs-mcp` (1 task, 5 files):** Under-estimated. No MCP server exists yet in this repo (`find ... mcp` returned nothing). A production stdio MCP server needs: (a) `@modelcontextprotocol/sdk` integration with stdio transport, (b) a prepublish step that walks `packages/mint-docs/` + `packages/site/pages/` (two separate doc trees exist — unclear which is canonical), (c) a BM25 or at least tokenized keyword index with tokenization/stopwords/stemming, (d) tool schema definitions validated against MCP spec, (e) error handling for malformed requests, (f) 4-client smoke tests that actually exercise `npx -y`, which requires publishing to npm first, which locks you into real-world version churn. Realistic: **3–5 days, 12–20 files**, split into "index builder" + "server + tools" + "publish harness."

**Phase 1 Task 2 — SSR `<head>` injection:** Seriously under-estimated. The landing is a **prerendered static Cloudflare Worker** (see `worker.ts:79-159`) whose `fetch` handler just serves `ASSETS.fetch()` with Cache API overlays — there is no per-request SSR rendering path at all. "SSR `<head>` injection" for blog posts requires either (a) rewriting the build-time prerender pipeline to take frontmatter per route and emit per-URL HTML with injected head tags, or (b) moving blog routes to runtime SSR (which breaks the aggressive edge-cache model). Additionally, the plan references `packages/landing/src/blog/seo/json-ld.ts` and `packages/landing/src/pages/blog/post.tsx` which **do not exist on this branch** — they live unmerged on `feat/2947-blog`. This task secretly depends on merging #2947 first. Realistic: **2–3 days just for the head-injection pipeline**, plus unknown cost if #2947 conflicts arise.

**Phase 2 Task 1 — Benchmark harness (400 LLM sessions):** Under-estimated by a factor of 2–3x. Each session needs: sandbox scaffold per framework, `npm install` (30–90s cold), agentic prompt loop with tool-use (not one-shot — real codegen takes multiple turns), `vtz test` or framework-equivalent runner, error-feedback-retry, token accounting, result capture. At ~$0.50–$2 per session and 2–5 min wall time, 400 sessions = $200–$800 and 13–33 hours of serial API time. Plus: fair test harnesses for *other* frameworks (Next.js + Drizzle + tRPC, Remix + Prisma, NestJS + TypeORM) do not exist anywhere in this repo. You'd be building four golden-path scaffolds and four scorers, not one. Realistic: **7–10 days**.

**Phase 4 Task 3 — Code validator:** `<20s per snippet cache-warm` is optimistic. Even with cached `node_modules`, `vtz run typecheck` on a non-trivial scaffold typically takes 8–15s by itself; snippet injection that references entities/services adds more. The plan also hand-waves the "triple-backtick metadata" convention — writer and validator must agree on it, and MDX fence-info parsing is not in scope for any existing package. Realistic per validation: **15–60s**, **~3 days** work.

**Phase 1 Task 4 — Analytics:** Consumes issue #1836 which is itself a multi-task effort. Treated as 1 task / 5 files; realistic: **2–3 days** once you factor in self-host vs cloud decision, GDPR/consent UI, and the custom daily dashboard script.

---

## Tasks that are under-specified

- **Phase 1 Task 1 (MCP):** which docs tree feeds the index — `packages/mint-docs/` or `packages/site/pages/`? Both exist. Ranking algorithm: "simple BM25 or keyword-match" is a deferred decision, not a spec.
- **Phase 1 Task 2 (SSR head):** no answer to "does this require runtime rendering, or build-time prerender?" Deeply affects `worker.ts` and cache strategy.
- **Phase 4 Task 3 (sandbox):** "Node_modules cached in monorepo CI to avoid re-install cost" — cached *where*? GitHub Actions cache has 10GB limits and a Vertz scaffold with all packages will be 1–2GB. Race conditions on parallel writes to a shared cache dir are unaddressed.
- **Phase 4 Task 3 (sandbox isolation):** "Isolated per pipeline run (copy, not shared)" — copy cost of `node_modules` is 30–90s on its own. Alternative (pnpm/bun hardlink install from cache) isn't specified.
- **Phase 4 Task 5 (Publisher):** "auto-merge if CI passes" conflicts with project rule "NEVER commit or push directly to `main`" (CLAUDE.md). Who approves the PR?
- **Phase 2 Task 1 (benchmark):** "Same LLM for all frameworks" — which agent harness? Claude Code? Raw API loop? Cursor? This is the entire experimental control and isn't picked.
- **Phase 2 Task 3 (30 long-tail pages):** route `/answer/[slug]` is invented. Landing uses prerendered routes only — dynamic `[slug]` SSR is not supported by the current worker.

---

## Missing infrastructure / dependencies

- **Slack workspace + bot app** (Phases 4 Task 6 + 5 Task 1) — not mentioned as existing; bot tokens, signing secret, approval-flow webhook endpoint all need a URL/hosting.
- **Private repo or S3** for citation tracker CSVs (Phase 1 Task 5) — unspecified which.
- **GSC service account** with OAuth consent (Phase 1 Task 3 + Phase 4 Task 1) — requires domain verification, which may not be set up.
- **Google Indexing API access** — restricted to JobPosting/Livestream by Google policy; generic URL notifications often get rejected. Plan assumes it works for blog posts.
- **IndexNow key hosting** — OK on Cloudflare but rotation/backup key policy unspecified.
- **Preview environment** (`preview.vertz.dev` referenced in Task 6 Slack message) — doesn't exist; Cloudflare Workers preview URLs are random UUIDs.
- **dev.to + Hashnode API tokens** + CI secrets storage (Phase 4 Task 5).
- **Anthropic API key with sufficient rate limits** for benchmark + pipeline (Phase 2 + 4).
- **Semrush subscription** — MCP is available but an active paid plan is required.
- **HN/PH launch accounts with karma** — plan mentions it but no verification Matheus's account has sufficient karma on both.
- **`@vertz/docs-mcp` npm scope setup** — plan assumes `@vertz` scope is publish-able from this repo.
- **Test frameworks for competitors** — Next+Drizzle+tRPC, Remix+Prisma, NestJS+TypeORM scaffolds and golden-path scorers.
- **Unpublish rollback** (Phase 4 Task 5) — requires dev.to/Hashnode delete APIs (supported) but no DLQ when a deploy has already promoted the URL into indexes.

---

## Integration risks between phases

- **Phase 1 Task 2 blocks Phase 2 entirely** — without per-blog-post head injection + canonical URLs + JSON-LD, publishing 7 posts plus 30 long-tail pages is SEO-useless. Phase 2's publication gate is claimed "when Phase 1 lands" — but if Task 2 slips 3 days, Phase 2 + Phase 3's launch week slides with it.
- **Phase 2 Task 3 requires routing support** that doesn't exist (`/answer/[slug]`). Either Phase 1 gets an extra hidden task ("dynamic routes in landing worker") or Phase 2 Task 3 needs a prerender-all-30 build-time approach — unclear which.
- **Phase 3 Task 1 (HN launch) gates on Phase 2 benchmark** which gates on Phase 1 SEO infra. Any slip in Phase 1 Tasks 1–2 cascades into "HN launch without schema + without MCP = -50% of the hook."
- **Phase 4 Task 3 validator needs the sandbox template project tracked as source of truth** — but Vertz is in active development. Every breaking framework change silently breaks the validator until someone fixes the template. No mechanism listed.
- **Phase 4 Task 2 writer uses MCP to read docs** — so writer depends on Phase 1 Task 1 being published and reachable. Not claimed as a dependency in the phase-4 file.
- **Phase 1 and Phase 2 are claimed parallelizable** — only true for Task 3 of Phase 2 (long-tails, content-only) and Task 5 (templates). Task 1 benchmark post drafting needs the benchmark run, which can start day 1; but publishing the post needs Phase 1 Task 2 head injection live, else it's unindexed.

---

## Single-owner feasibility

Not feasible in 28 days for one person + agents as scoped. The plan lists **27 tasks across 5 phases**, each with meaningful infra work, cross-service auth, and content that requires human judgment. A realistic per-task cost (including review loop, flaky-API debugging, and the always-present "agent produced something that needs rework"):

- Phase 1: 5 tasks × 1.5–3 days = **9–15 days**
- Phase 2: 5 tasks × 1–3 days (benchmark alone ≥ 5) = **10–14 days**
- Phase 3: mostly launch-day events but prep + response load ≥ **5–7 days** of calendar time
- Phase 4: 7 tasks, pipeline integration work, realistically **12–18 days**
- Phase 5: mostly operations but 3 tooling tasks (dashboards, attribution, eval) = **4–6 days**

Sequential floor with some parallelism: **45–60 days** for one owner with agent help. The specific things that require Matheus personally (HN launch engagement, PH launch replies, influencer DMs, Reddit 2-hour response window, Slack approvals, retro rituals) are not parallelizable to agents.

---

## Recommended timeline adjustment

**Honest estimate: 8–10 weeks (56–70 days)** to reach all acceptance thresholds with one owner, not 28 days. To get to 28 days and hit the top-line goal ("cited in ≥1 LLM"), ruthlessly cut scope:

- **Weeks 1–2 (the real 28-day target):** `@vertz/docs-mcp` + SSR head + IndexNow + citation tracker + benchmark post + README. That alone is ambitious.
- **Cut from the 28-day window:** Phase 4 entire (pipeline), Phase 2 Tasks 3 & 5, Phase 3 Tasks 2–5, Phase 5 Tasks 2–6. These are week 5–10 work.
- **Resequence:** Don't begin Phase 4 until Phase 2's first 3 posts have run a full publish-measure cycle so template extraction is grounded in real performance data, not the writer's first draft.
- **Critical-path gate:** Phase 1 Task 2 (SSR head) is the hidden blocker on the whole plan. It should be moved to **day 1–3** and validated by a working "publish one post, see schema on Google Rich Results test pass" before anything else in Phase 2 is published. If #2947 is not already merged to main, **merging #2947 is phase zero** and is not reflected anywhere in the plan.

Key files referenced:
- `/Users/matheuspoleza/Workspace/Vertz/vertz/packages/landing/src/worker.ts` (static-asset worker, no SSR path)
- `/Users/matheuspoleza/Workspace/Vertz/vertz/packages/landing/src/pages/` (only home/manifesto/openapi on current branch)
- `/Users/matheuspoleza/Workspace/Vertz/vertz/packages/landing/src/blog/seo/json-ld.ts` (exists only on unmerged `feat/2947-blog`)
- `/Users/matheuspoleza/Workspace/Vertz/vertz/packages/mint-docs/` + `packages/site/pages/` (two doc trees — MCP indexing target ambiguous)
- `/Users/matheuspoleza/Workspace/Vertz/vertz/packages/agents/` (exists; pipeline can use it, but adds dogfood risk to content production)
