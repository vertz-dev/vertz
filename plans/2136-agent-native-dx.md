# Agent-Native Developer Experience

**Issue:** #2136
**Status:** Draft
**Date:** 2026-03-31

---

## Problem

When an AI agent builds a Vertz project, it spends most of its effort on boilerplate and project understanding — not on business logic. Based on current benchmarks: 6 turns, 146K tokens, 35s for a simple Hello API. Of those 6 turns, 4 are setup and wiring.

The deeper problem is the entire end-to-end flow: from discovering the framework, to understanding an existing project, to adding features, to validating changes. At each step, the agent lacks the right information or the right tool, so it falls back to manual file creation — which is slow, error-prone, and expensive in tokens.

## Vision

At every moment in the development cycle, the framework reduces the cognitive distance between intent and result.

| Moment | Current state | Target state |
|--------|--------------|--------------|
| Discover Vertz | Read 5+ doc pages | Quick reference (~500 tokens) + llms.txt |
| Create project | Fixed templates (hello-world or todo-app) | Composable scaffold: `--with api,ui,router` |
| Understand project | Explore 10+ files manually | `vertz inspect --json` + dynamic AGENTS.md |
| Add standard feature | Create 3+ files + manual wiring | `vertz add entity <name> --fields "..."` |
| Add custom feature | Guess conventions | AGENTS.md + `.claude/rules/` with clear patterns |
| Validate before acting | Try and see what happens | `--dry-run` with impact analysis |
| Debug | Read stack traces | `vertz check` with structured diagnostics |

The framework doesn't force one path — it makes the right path the easiest path.

## Differentiation

### vs. Rails generators

Rails generates one layer (backend + server-rendered views). Vertz generates **full-stack** in a single command: schema → entity → codegen → typed client SDK → reactive UI. This is possible because Vertz controls the entire typed pipeline.

### vs. Next.js / Laravel AGENTS.md

Their context files are static — written once, never updated. Vertz's AGENTS.md is **dynamic** — generated from the AppIR (real AST analysis of the project), reflecting actual entities, pages, routes. Updated automatically when the project changes.

### vs. Terraform plan

Terraform plans infrastructure changes. `vertz add --dry-run` plans **application code changes** — with conflict detection and impact analysis powered by ts-morph AST analysis.

### What nobody does

1. Dynamic agent context generated from real project analysis (AppIR → AGENTS.md)
2. Full-stack typed CLI commands (1 command = working feature from DB to UI)
3. Plan/dry-run with AST-based impact analysis on application code
4. Context engine generating optimized output for all AI tools from a single source

---

## Architecture

### Three layers of agent context

**Layer 1 — Self-describing structure (universal, zero config)**

Clear naming conventions make the project understandable via simple glob/ls:

```
src/api/entities/users.entity.ts    → "entity users exists"
src/api/entities/posts.entity.ts    → "entity posts exists"
src/pages/posts.tsx                 → "posts page exists"
src/pages/users.tsx                 → MISSING → "users has no page"
```

Any agent understands this without special tooling.

**Layer 2 — CLI as context API (universal, any agent that runs shell)**

```bash
vertz inspect --json     # structured project state
vertz check              # diagnostics
vertz add --dry-run      # preview changes before applying
vertz add --help         # available capabilities
```

Always up-to-date (reads the real project). Works with every coding agent.

**Layer 3 — Generated static files (tool-specific, maintained by engine)**

AGENTS.md (universal standard, Linux Foundation) + CLAUDE.md (Claude-specific) + .cursorrules (Cursor-specific). Generated from a single source via `vertz sync-context`.

### Context engine: blocks + adapters

**Source: context blocks**

```
Static blocks    → framework conventions (how entity() works, how css() works, CLI commands)
Dynamic blocks   → project state via AppIR (current entities, pages, routes, what's missing)
```

**Adapters: one per tool**

| Adapter | Output | Strategy |
|---------|--------|----------|
| Claude | CLAUDE.md + .claude/rules/*.md | Split (contextual loading, saves tokens) |
| Cursor | .cursorrules | Single file (Cursor reads one file) |
| Copilot | .github/copilot-instructions.md | Single file |
| Generic | AGENTS.md | Universal standard |

Adding a new tool = writing one adapter (~20 lines). Adding a new convention = adding one static block. Project changes = dynamic blocks regenerated automatically.

**Command:**

```bash
vertz sync-context                    # generate for all tools
vertz sync-context --only claude      # only Claude Code
```

Runs automatically after: `bun create vertz` (scaffold), `vertz add entity/page` (project changed).

### Composable scaffold engine

Templates become presets of composable feature blocks:

**Feature blocks:**

| Feature | Files generated | Depends on |
|---------|----------------|------------|
| `core` | package.json, tsconfig.json, .gitignore, AGENTS.md | — |
| `api` | vertz.config.ts, .env, server.ts, env.ts | core |
| `db` | db.ts, schema.ts | api |
| `entity-example` | tasks.entity.ts | db |
| `ui` | app.tsx, entry-client.ts, theme.ts, bunfig.toml, bun-plugin-shim.ts, favicon | core |
| `router` | router.tsx, pages/home.tsx, pages/about.tsx, nav-bar.tsx | ui |
| `client` | client.ts (#generated) | api, ui |

**Presets:**

```
api        = [core, api, db, entity-example]
ui         = [core, ui, router]                    (alias: hello-world)
full-stack = [core, api, db, entity-example, ui, router, client]  (alias: todo-app)
```

**Usage:**

```bash
bun create vertz my-app --template api          # preset
bun create vertz my-app --template full-stack   # preset
bun create vertz my-app --with api,ui           # custom composition
```

Features are context-aware: `ui` adapts app.tsx based on whether `router` is present. `api` adapts server.ts based on whether `entity-example` is present.

### Plan system (vertz add + dry-run)

```
Compiler.analyze() → AppIR (current state)
    ↓
Intent parsing (CLI args → typed Intent)
    ↓
Validation (Intent + AppIR → conflicts, dependencies, impact)
    ↓
Plan object (operations: create/modify/delete + warnings + post-steps)
    ↓
Display (terminal or --json) → approval
    ↓
Apply (create/modify files + save plan for undo + run codegen + sync-context)
```

**Example:**

```bash
$ vertz add entity comments --fields "body:text, rating:integer" --belongs-to posts --dry-run
```

```
Plan: add entity "comments"

  CREATE  src/api/entities/comments.entity.ts
  MODIFY  src/api/schema.ts
          + commentsTable (body:text, rating:integer, postId:uuid FK)
          + commentsModel
  MODIFY  src/api/server.ts
          + import { comments } from './entities/comments.entity'
          + entities: [users, posts, comments]
  RUN     codegen → .vertz/generated/ updated
  CREATE  src/pages/comments.tsx (detected ui feature)
  MODIFY  src/router.tsx
          + '/comments': { component: () => <CommentsPage /> }

Summary: 2 created, 3 modified, codegen triggered
```

**Conflict detection:**

```
⚠ Entity "posts" already exists in schema.ts (line 14)
  Suggestion: use "vertz add field posts body:text" instead
```

**Impact analysis (for modifications):**

```
⚠ Removing "email" from users would break:
  src/pages/users.tsx:42      → uses user.email in JSX
  src/pages/profile.tsx:15    → uses user.email in form
```

**Existing infrastructure reused:**

| Existing | Purpose |
|----------|---------|
| `packages/compiler/src/compiler.ts` | `Compiler.analyze()` → AppIR |
| `packages/compiler/src/ir/types.ts` | AppIR types (EntityIR, fields, relations, access) |
| `packages/compiler/src/analyzers/entity-analyzer.ts` | Entity extraction via ts-morph |
| `packages/compiler/src/ir/entity-route-injector.ts` | `detectRouteCollisions()` |
| `packages/codegen/src/generate.ts` | Codegen pipeline |
| `packages/codegen/src/incremental.ts` | Incremental write with hash diffing |
| `packages/cli/src/config/loader.ts` | Config loading (vertz.config.ts) |

**New pieces:**

| New | Location |
|-----|----------|
| Intent parser | `packages/cli/src/plan/intent.ts` |
| Validator | `packages/cli/src/plan/validate.ts` |
| Plan builder | `packages/cli/src/plan/builder.ts` |
| File generators | `packages/cli/src/plan/generators/` |
| File modifiers (ts-morph write-back) | `packages/cli/src/plan/modifiers/` |
| Plan renderer | `packages/cli/src/plan/render.ts` |
| Plan executor | `packages/cli/src/plan/apply.ts` |

---

## Testing: ax-bench

### What it is

A separate benchmarking pipeline (`vertz-dev/ax-bench`) that measures AI agent performance when building with Vertz. It's an external observer — not part of the framework repo — to avoid bias.

### What it measures

| Metric | What | Why |
|--------|------|-----|
| Turns | Agent ↔ tool interactions | Less turns = less latency, lower cost |
| Tokens | Total input + output tokens | Direct cost ($) |
| Time | Total time to working code | Developer UX |
| Success rate | % of runs ending with working app | Reliability |
| Errors | Retries before success | Context quality indicator |
| First-try accuracy | First generated code already works? | North Star metric |

### Scenarios

```
Tier 1 — Hello World
  "Create a Vertz app that shows Hello World"
  Target: 1-2 turns, ~20K tokens

Tier 2 — Single Entity CRUD
  "Create a Vertz app with a tasks entity (title, completed) and UI"
  Target: 2-3 turns, ~50K tokens

Tier 3 — Multi-Entity with relations
  "Create a blog app with users and posts (posts belong to users)"
  Target: 4-5 turns, ~100K tokens

Tier 4 — Full-stack with custom UI
  "Create a project management app with tasks, projects,
   and a dashboard showing task counts per project"
  Target: 6-8 turns, ~150K tokens

Tier 5 — Modify existing project
  "Add a comments entity to this existing blog app"
  Target: 1-2 turns, ~30K tokens
```

### Bias prevention

- Prompts are generic — no framework-specific hints ("Create a blog app", not "Use createServer with entities array")
- Verification is automated: typecheck passes, server starts, endpoints respond, UI renders
- Each run: clean temp directory, no conversation cache, no prior framework context
- Same model version across all runs

### Local testing workflow

```bash
# Baseline: measure with current published docs
ax-bench run --suite all --docs https://docs.vertz.dev
# → baseline.json

# Change docs locally
cd vertz/packages/mint-docs && bun run dev  # localhost:3001

# Measure with local docs
ax-bench run --suite all --docs http://localhost:3001
# → latest.json

# Compare
ax-bench compare baseline.json latest.json
#   Tier 2: Turns 4.2→2.8 (-33%), Tokens 89K→52K (-42%), Success 78%→94% (+16%)
```

For CLI changes (inspect, add entity):

```bash
# Point ax-bench at local CLI instead of published
ax-bench run --suite tier-5 --vertz-cli ../vertz
```

### Integration with development loop

Every PR in this initiative is validated by ax-bench:

| PR | What changes | ax-bench validates |
|----|-------------|-------------------|
| PR 1: Composable scaffold | Templates + --with | Tier 1-2: turns to create project |
| PR 2: Context engine | AGENTS.md + sync-context | Tier 1-4: success rate, first-try accuracy |
| PR 3: vertz inspect | Project introspection | Tier 5: turns to understand + modify |
| PR 4: vertz add entity | CLI semantic commands | Tier 2-3: turns + tokens for entity creation |
| PR 5: vertz add page + check | UI generation + validation | Tier 4: full-stack custom app |
| PR 6: Docs optimization | Quick reference + llms.txt | Tier 1-4: cold-start discovery |

---

## Implementation sequence

### PR 0: ax-bench baseline

**Repo:** `vertz-dev/ax-bench` (separate)

Build the benchmark pipeline. Run against current state of Vertz to establish baseline metrics.

Deliverables:
- Benchmark runner with 5 tier scenarios
- Automated verification (typecheck, server, endpoints, UI)
- Metric collection (turns, tokens, time, success rate)
- Comparison tool (`ax-bench compare`)
- Support for `--docs <url>` and `--vertz-cli <path>` flags
- `baseline.json` with current Vertz performance

### PR 1: Composable scaffold engine

**Repo:** `vertz-dev/vertz` — `packages/create-vertz-app/`

Replace fixed templates with composable feature blocks.

Deliverables:
- Feature block architecture (types, registry, compose engine)
- 7 feature blocks: core, api, db, entity-example, ui, router, client
- Presets: api, ui, full-stack (+ backward compat for hello-world, todo-app)
- `--with` flag for custom composition
- Context-aware generation (features adapt based on other features present)
- All existing scaffold tests pass unchanged

Files:
- `packages/create-vertz-app/src/features/` — feature blocks + compose engine
- Modified: `types.ts`, `prompts.ts`, `scaffold.ts`

### PR 2: Context engine + dynamic AGENTS.md

**Repo:** `vertz-dev/vertz` — `packages/cli/src/context/`

Build the context engine that generates tool-specific files from a single source.

Deliverables:
- Static context blocks (framework conventions)
- Dynamic context blocks (project state from AppIR)
- Adapters: Claude, Cursor, Copilot, generic (AGENTS.md)
- `vertz sync-context` command
- Scaffold (PR 1) calls sync-context automatically after project creation
- AGENTS.md includes: project state, conventions, available CLI commands

Files:
- `packages/cli/src/context/blocks/static/` — convention blocks
- `packages/cli/src/context/blocks/dynamic/` — project state from AppIR
- `packages/cli/src/context/adapters/` — tool adapters
- `packages/cli/src/context/sync.ts` — orchestrator
- `packages/cli/src/commands/sync-context.ts` — CLI command

### PR 3: `vertz inspect`

**Repo:** `vertz-dev/vertz` — `packages/cli/`

Expose AppIR as structured JSON via CLI.

Deliverables:
- `vertz inspect --json` — full project state
- Output: entities (fields, access, relations), pages, routes, features
- Suggestions: what's missing (entity without page, no auth configured, etc.)
- Reuses `Compiler.analyze()` from `packages/compiler/`

### PR 4: `vertz add entity` + plan/dry-run

**Repo:** `vertz-dev/vertz` — `packages/cli/`

The semantic CLI command that generates a full-stack feature from a single command.

Deliverables:
- `vertz add entity <name> --fields "..." [--belongs-to ...] [--dry-run]`
- Intent parser, Validator, Plan builder
- File generator (new files) + File modifier (modify server.ts, schema.ts, router.tsx via ts-morph)
- Conflict detection (entity already exists, route collision)
- `--dry-run` shows full plan before applying
- Auto-runs codegen + sync-context after apply
- Plan saved to `.vertz/plans/` for potential undo

### PR 5: `vertz add page` + `vertz check`

**Repo:** `vertz-dev/vertz` — `packages/cli/`

Deliverables:
- `vertz add page <name> [--crud --for <entity>]` — generates page + route
- `vertz check` — validates entire project (schema, entities, routes, codegen status)
- Structured diagnostic output

### PR 6: Docs optimized for agents

**Repo:** `vertz-dev/vertz` — `packages/mint-docs/`

Deliverables:
- Quick reference page (~500 tokens, dense cheat sheet — not a tutorial)
- llms.txt (Mintlify has native support)
- Getting started rewritten CLI-first (commands, not "create these files")
- Agent-friendly structure: answer → example → reference (not explanation → context → example)

---

## Success metrics

Based on issue #2136 baseline (6 turns, 146K tokens for Hello API):

| Scenario | Baseline (estimated) | Target |
|----------|---------------------|--------|
| Tier 1: Hello World | 3 turns, 50K tokens | 1-2 turns, 20K tokens |
| Tier 2: Single CRUD | 6 turns, 146K tokens | 2-3 turns, 50K tokens |
| Tier 3: Multi-Entity | 10 turns, 250K tokens | 4-5 turns, 100K tokens |
| Tier 4: Full-stack custom | 15+ turns, 400K+ tokens | 6-8 turns, 150K tokens |
| Tier 5: Modify existing | 5 turns, 100K tokens | 1-2 turns, 30K tokens |
| Success rate (all tiers) | ~70% | 95%+ |

**North Star:** "My LLM nailed it on the first try" → first-try accuracy > 80%

---

## Build vs. buy decisions

| Piece | Decision | Rationale |
|-------|----------|-----------|
| Context format | **AGENTS.md standard** | 60K+ projects, Linux Foundation governance |
| Multi-tool sync | **Build lightweight engine** | rulesync is generic; we need dynamic blocks from AppIR |
| llms.txt | **Mintlify native** | Configuration, not development |
| AST analysis | **ts-morph (already in repo)** | Compiler already uses it for reading; extend for writing |
| Benchmark | **ax-bench separate repo** | External observer avoids measurement bias |
