---
status: scoping
date: 2026-04-19
author: Vinicius Dacal + Claude
---

# Open Agents Clone — Scoping Note

> This is a **pre-design scoping note**, not a design doc. Approval here unblocks formal design docs for each framework gap below.

## Goal

Build a Vertz-native, open-source clone of [vercel-labs/open-agents](https://github.com/vercel-labs/open-agents) (~3.8k stars, "background coding agents" template). Two outcomes:

1. **Marketing for Vertz the framework** — a flagship public demo that's obviously simple-and-Vertzy enough that forking is the path of least resistance.
2. **Funnel for Vertz Cloud** — "deploy your forked agent to Vertz Cloud in one click" is the conversion path. The cloud platform stays private; the moat is the managed multi-tenancy, scheduling, observability, and billing.

Inspiration, not parity. Cloning an evolving target (open-agents pushes daily) means always chasing. Taking the architecture as inspiration lets the demo lean into Vertz idioms (JSX-first, typed tools, single-schema, `@vertz/agents`).

## Demo Scope (public repo)

Single Vertz full-stack app on Cloudflare Workers:

- Chat UI for talking to a coding agent (streaming messages + tool calls)
- One agent (`coder`) with tools: `readFile`, `writeFile`, `exec`, `gitCommit`, `openPR`
- Pluggable `Sandbox` interface with two providers: `local` (Docker, dev) and `daytona` (cloud)
- GitHub App for clone / branch / push / PR automation
- Session persistence — sessions, messages, runs as Vertz entities
- `vtz dev` boots the whole thing locally with no API keys required (Docker sandbox + local LLM or BYO key)

**Out of scope** for the public repo:
- Multi-tenancy beyond single-user-per-session
- Billing, quotas, scheduling
- The Daytona-on-our-infra control plane (that's the platform repo)
- Voice (open-agents ships ElevenLabs; not needed for the demo)
- Session sharing / team features

**Repo layout:**

```
open-agents-vertz/
├── apps/web/                # the full-stack Vertz app
│   └── src/
│       ├── routes/          # / and /sessions/:id
│       ├── agents/coder.ts  # the durable agent
│       ├── tools/           # fs, shell, git, pr
│       ├── entities/        # session, message, run
│       ├── sandbox/         # picks provider from env
│       └── schemas/
├── packages/sandbox/        # pluggable Sandbox interface (its own pkg)
└── vertz.config.ts
```

`packages/sandbox/` is extracted so the private platform repo can depend on it without forking the whole app.

## Framework Gaps This Surfaces

The demo cannot ship without closing four gaps. Each is **independently valuable** — every Vertz Cloud customer building agents will hit them.

| # | Gap | Why we need it | Owner package |
|---|---|---|---|
| 1 | Streaming `run()` — per-step events as `AsyncIterable` | "Watch the agent think." Without this, UI shows a spinner for 30s. | `@vertz/agents` |
| 2 | HTTP transport for agents — `app.serve(coder)` wires `POST /agents/coder` + WS for events | Today you hand-roll routes. Every consumer will. | `@vertz/agents` + `@vertz/server` |
| 3 | `query()` subscription support — data source can be `AsyncIterable` / WebSocket factory; new items append into the cached collection | The primitive that makes streaming feel native, single mental model with `query()`. | `@vertz/ui` |
| 4 | `AgentStore` ↔ entity bridge — agent sessions/messages as Vertz entities | RLS-aware, queryable from the rest of the app, lives alongside the user's data. Today `AgentStore` is a parallel world (memory + SQLite only). | `@vertz/agents` + `@vertz/server` |

Citations for current state (so design docs start grounded):
- `agent()` factory: `packages/agents/src/agent.ts:30`
- `tool()` factory: `packages/agents/src/tool.ts:11`
- `run()` returns final state, no events: `packages/agents/src/run.ts:130`
- `query()` polls but doesn't subscribe: `packages/ui/src/query/query.ts:138`
- WebSocket pattern exists for cache invalidation only: `packages/ui/src/auth/access-event-client.ts:77`

## Phasing

Three slices, each independently mergeable. Slices 1a/1b parallelize.

**Slice 1a — `query()` streaming** (UI-only, no agent dependency)
- Gap 3
- Unblocks: live chat UI in any context, not just agents

**Slice 1b — Streaming `run()`** (agents-only, no UI dependency)
- Gap 1
- Unblocks: any consumer wanting per-step agent feedback

**Slice 2 — Wiring**
- Gap 2: HTTP + WS transport (depends on 1b)
- Gap 4: `AgentStore` ↔ entity bridge (depends on entities — already stable)

**Slice 3 — The demo**
- `apps/web/` — UI, agent, tools, entities
- `packages/sandbox/` — interface + Docker provider + Daytona provider
- GitHub App setup docs
- One-click "deploy to Vertz Cloud" path (button in README)

Each slice gets its own design doc with the standard three sign-offs (DX, product, technical) before implementation, per `.claude/rules/design-and-planning.md`.

## Open Questions (decide before design docs)

1. **Breaking changes to `run()`'s return type.** Streaming events probably mean changing `run()`'s signature (returning `AsyncIterable` of events, with the final state as a terminal event). Pre-v1 so OK in principle — but worth confirming: is `@vertz/agents` already in use anywhere internal that would break?
2. **GitHub App config storage.** Per-tenant entity? Env vars in the public template? Vertz Cloud has no UI for this yet — the demo will need the simplest path that works.
3. **Daytona snapshot economics.** The hibernate/resume model only saves money if Daytona's billing actually rewards it. Need to sanity-check before committing the `Sandbox` interface to `hibernate()`/`restore()` — if it doesn't, the interface should be different.
4. **LLM choice for the demo.** Open-agents is model-agnostic. We should default to one that's free for forkers to try (Claude trial? Local via Ollama? OpenRouter?). This shapes the agent loop's expectations.

## Definition of "Approved"

User signs off on this scoping note → spawn formal design doc agents in parallel for the four gaps + the demo:

- **DX agent** — designs `query()` streaming API + agents HTTP transport API surface
- **Technical agent** — designs streaming `run()` events + `AgentStore` ↔ entity bridge
- **Product/scope agent** — writes the demo app architecture doc, with the four open questions resolved

Each design doc then runs the standard three-sign-off review per `.claude/rules/design-and-planning.md` before any implementation begins.
