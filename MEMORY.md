# MEMORY.md

## Core Principles (from the human, non-negotiable)

### Ship, Don't Ask — 2026-02-14
**The goal is delivering value, not opening PRs.** PRs exist to merge. If there's an obvious next step (CI failing on an approved PR, review needed, merge conflict to resolve), just do it. Don't ask for confirmation on obvious work.

Priority chain for open PRs:
1. CI failing → spawn someone to fix it immediately
2. Review needed → assign/request review
3. Merge conflict → resolve it
4. Approved + green → merge it

The finish line is **merged and shipped**, not "PR opened."

### Auto-Merge Policy — 2026-02-14
PRs can auto-merge (no CTO approval) when: CI green + approved + changeset present + reviewer confirms no public API breaking changes. If breaking public API → CTO must approve. **Don't trust changeset bump type** as a signal — agents don't use major bumps yet, so breaking changes could be labeled as patch. Reviewer must evaluate the actual diff. The "version packages" PR (release to customers) still requires CTO decision.

### Always Push Work — 2026-02-14
We lost Kai's canvas rendering spike AND Josh's WebGL feasibility report AND Josh's compiler exploration because they only lived in sessions that expired. **Rule in RULES.md:** all agents must create a branch and push early/often. Sessions die; git doesn't.

### Be a Sparring Partner — 2026-02-14
CTO explicitly asked: don't just agree, push back, offer counterpoints, coach, suggest improvements. Updated SOUL.md to enforce this.

### Model Policy — 2026-02-14
- **Regular engineering work:** MiniMax M2.5 (all sub-agents)
- **Adversarial code reviews:** Opus — but tiered. Core packages, public APIs, security, or >200 lines → Opus. Small/routine PRs → MiniMax is fine.

### The .value Problem — 2026-02-14
CTO's strong position: developers should NEVER see `.value` or know signals exist. The `let`/`const` principle is the crown jewel — compiler already transforms `let x = 0` to signals inside components. But `.value` leaks at boundaries (query(), form(), external signal sources). Three approaches discussed:
1. Compiler-aware return types (2-3 weeks, covers 90%)
2. Proxy-based auto-unwrap (1 week, has tradeoffs)  
3. Full compiler rewrite with deep type awareness (Zig/Bun route, 2-3 months)
Recommendation: Approach 1 now, design Approach 3 in parallel.

### Launch Strategy — 2026-02-14
- Following Resend's heartbeat framework, adapted for a platform
- Launch Week 1: "The UI" (reactivity, compiler, CSS, SSR, create-vertz-app)
- Launch Week 2: "The Backend" (schema, ORM, codegen, entity-aware fetching, full-stack)
- CTO insists: don't ship data layer until unified API is designed (codegen + ORM + fetch should feel like one coherent system)
- One more week of polish before launch, not rushing
- CTO has NO budget for human DevRel expert — agents only for now

### Positioning — 2026-02-14
Vertz competes with: React/Solid/Svelte (UI), Next/Remix (full-stack), Nest.js (backend), Prisma (ORM). It's a full platform, not just a UI framework. But must introduce concepts gradually — don't overwhelm.

## Infrastructure Notes

### GitHub Token Refresh — 2026-02-14
- GitHub App installation tokens expire after 1 hour
- Created `/workspace/backstage/openclaw/refresh-gh-token.sh` to regenerate tokens
- Cron job runs every 50 min (Haiku, silent unless failure)
- Token written to `/tmp/gh-token-raw`, shells read from there via `.bashrc`
- Bot identity: `vertz-tech-lead[bot]` (mike)

### Compiler Exploration — 2026-02-14
CTO asked team to explore Zig/Bun compiler. Josh ran a feasibility study (lost to session). Key finding: SWC (Rust) gave Next.js 20-70x speedup over Babel. Bun internals are Zig. WASM as middle ground. Entity-aware compilation at scale is where native compiler matters most.

## Team

### Agents
- **ben** (vertz-dev-core) — core engine, SSR, compiler
- **nora** (vertz-dev-front) — frontend, reviews
- **ava** (vertz-dev-dx) — DX tooling, demos
- **josh** (vertz-advocate) — developer advocacy, content
- **edson** (vertz-devops) — devops, CI/CD
- **riley** (vertz-platform) — platform PM, squad oversight
- **kai** (graphics) — Senior Graphics Engineer, Canvas Squad
- **luna** (devrel) — Head of DevRel & Launch Strategy (NEW — 2026-02-14)

## Active Work — 2026-02-14
- PR #262 (SSR) — MERGED ✅
- PR #263 (demo toolkit) — approved by Nora, Ava fixing CI
- PR #220 (version packages) — parked, merge conflict (CTO decision)
- Kai — canvas rendering spike complete, pushed to `spike/canvas-rendering-poc`
- Josh — showcase demo done, pushed to `feat/showcase-demo` (silent, needs TTS)
- Luna — just created, needs to be spun up for launch planning

## Cron Jobs
- PR Monitor (every 5 min) — now auto-merges qualifying PRs
- GH Token Refresh (every 50 min) — Haiku, silent
- Squad Check-in / Riley (Mon & Thu 10 AM UTC) — checks squad status files
