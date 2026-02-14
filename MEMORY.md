# MEMORY.md

## Core Principles (from the human, non-negotiable)

### Ship, Don't Ask — 2026-02-14
**The goal is delivering value, not opening PRs.** If there's an obvious next step, just do it.

### Auto-Merge Policy — 2026-02-14
PRs auto-merge when: CI green + approved + changeset present + reviewer confirms no breaking public API. Breaking public API → CTO approval. Version PR → CTO decision. Don't trust changeset bump type.

### Always Push Work — 2026-02-14
All agents must create a branch and push early/often. Sessions die; git doesn't.

### Be a Sparring Partner — 2026-02-14
Push back, offer counterpoints, coach, suggest improvements. Don't be a yes-person.

### Model Policy — 2026-02-14
- Regular work: MiniMax M2.5
- Reviews (core/APIs/security/>200 lines): Opus
- Cron/utility jobs: MiniMax M2.1 (cheapest available)
- Never use models not in the config (Haiku isn't configured — caused token refresh failure)

### The .value Problem — 2026-02-14
Developers should NEVER see `.value`. Compiler-aware return types (Approach 1) being built by Ben. Launch-blocking.

### Launch Strategy — 2026-02-14
- LW1 "The UI" (~1 week), LW2 "The Backend" (~3-4 weeks later)
- Data layer needs unified API design before LW2
- All launch/marketing content goes in backstage (private), NOT vertz (open source)
- Luna (DevRel agent) owns strategy, Josh executes content

### Positioning — 2026-02-14
Competes with React/Solid/Svelte, Next/Remix, Nest.js, Prisma. Full platform.

## Infrastructure

### GitHub Token Refresh — 2026-02-14
- Tokens expire after 1 hour. Refresh script: `/workspace/backstage/openclaw/refresh-gh-token.sh`
- Cron every 50 min on MiniMax M2.1. Token at `/tmp/gh-token-raw`.
- Bug: originally set to Haiku which isn't configured → silent failure. Fixed.

### Workspace Persistence — 2026-02-14
- Workspace files (SOUL.md, RULES.md, MEMORY.md, AGENTS.md, squads/) persisted to `backstage/openclaw/workspace-files/`
- Entrypoint updated to restore from backstage on container restart

## Team
- **ben** (vertz-dev-core) — core, SSR, compiler
- **nora** (vertz-dev-front) — frontend, reviews
- **ava** (vertz-dev-dx) — DX, demos, CI
- **josh** (vertz-advocate) — developer advocacy, content
- **edson** (vertz-devops) — devops, CI/CD
- **riley** (vertz-platform) — platform PM, squad oversight
- **kai** (graphics) — Senior Graphics Engineer, Canvas Squad
- **luna** (devrel) — Head of DevRel & Launch Strategy

## Active Work — 2026-02-14
- PR #262 (SSR) — MERGED ✅
- PR #263 (demo toolkit) — approved, Ava fixing CI
- Ben — killing `.value` (`feat/eliminate-dot-value`)
- Luna — creating launch plan in backstage
- Kai — canvas spike complete, parked
- Josh — showcase demo done, needs TTS for narration

## Cron Jobs
- PR Monitor (every 5 min) — auto-merges qualifying PRs
- GH Token Refresh (every 50 min) — MiniMax M2.1, silent
- Squad Check-in / Riley (Mon & Thu 10 AM UTC)
