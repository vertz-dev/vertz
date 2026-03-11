# AI Productivity Benchmark Pipeline

## Context

Vertz is a full-stack TypeScript framework optimized for LLMs. The central hypothesis: **end-to-end type safety at build time eliminates runtime unknowns, making AI agents dramatically more productive**. Today there is no infrastructure to measure this. The existing benchmarks (`benchmarks/`) measure build time, bundle size, and cold start — framework metrics, not AI productivity metrics.

This plan designs a pipeline that answers: **"How much more productive is AI with Vertz vs traditional stacks?"**

---

## Design Decisions

- **Real agent**: Claude Code CLI (`claude -p` with `--output-format json`) — not a simulated API
- **Multi-stack**: Vertz vs Next.js+Prisma vs Next.js+Drizzle vs Nest+React (+ "open prompt" with no defined stack)
- **Multi-model**: Claude Sonnet, Claude Opus (+ potentially GPT-4o)
- **Location**: `benchmarks/ai-productivity/` in the monorepo
- **Two prompt axes**: "directed" (specifies the framework) vs "open" (lets the agent choose)

---

## Methodology

### Two Test Dimensions

**Axis 1 — Directed (framework specified)**
The prompt says "Use Vertz" / "Use Next.js+Prisma" / etc. Measures productivity given that the framework has already been chosen.

**Axis 2 — Open (framework free)**
The prompt describes the task without mentioning a stack. Measures:
- Which stack does the AI naturally choose?
- Is the AI more productive when it chooses vs when it's directed?
- If the AI spontaneously chooses Vertz (after training with the docs), it's a strong signal

### What to Measure (5 Dimensions)

| Dimension | Metric | How to Capture |
|-----------|--------|----------------|
| **Cost** | Total tokens (input+output), USD | `--output-format json` → `usage` from Claude Code |
| **Iterations** | Turns to complete, tool calls | Stream JSON events or session metadata |
| **First-try success** | Compiled on 1st attempt? Tests passed? | Evaluator runs after agent finishes |
| **Quality** | Composite score: compile + tests + types + lint | Automated evaluation pipeline |
| **Errors** | Type errors vs runtime errors vs logic errors | Error classifier in evaluator |

### Controlled Experiment Design

- **Independent variable**: framework (Vertz vs Next+Prisma vs Next+Drizzle vs Nest+React vs open)
- **Controlled variables**: same model, same temperature, same prompt format, same tasks
- **Minimum N**: 5 runs per (task, framework, model). High-variance tasks: 10 runs
- **Statistics**: Welch's t-test, Cohen's d, 95% CI via t-distribution

---

## Agent: Claude Code CLI

### Invocation

```bash
claude -p "$TASK_PROMPT" \
  --output-format json \
  --max-turns 20 \
  --allowedTools "Read,Edit,Write,Bash,Glob,Grep" \
  --model claude-sonnet-4-20250514
```

### Metrics Capture

`--output-format json` returns:
```json
{
  "result": "...",
  "session_id": "uuid",
  "usage": {
    "inputTokens": 12345,
    "outputTokens": 6789,
    "cacheReadTokens": 1000,
    "cacheCreationTokens": 500,
    "totalCost": 0.15
  }
}
```

For granular metrics (per turn), use `--output-format stream-json` and parse NDJSON events.

### Sandbox

Each run executes in a temporary directory copied from the scaffold:
1. `cp -r scaffold/ /tmp/bench-<uuid>/`
2. `cd /tmp/bench-<uuid>/ && bun install` (pre-warm deps)
3. Spawn Claude Code with cwd in the temp dir
4. After completion, run evaluator in the temp dir
5. Collect metrics and clean up

---

## Compared Stacks

### Stack 1: Vertz (directed)
- Scaffold based on `examples/entity-todo/`
- Schema → model → entity → server → codegen → SDK → UI
- CLAUDE.md with Vertz docs in the project

### Stack 2: Next.js + Prisma + React + TypeScript
- Next.js App Router + Prisma ORM + API routes + React components
- Most mainstream full-stack typed stack
- No tRPC (plain HTTP routes)

### Stack 3: Next.js + Drizzle + React + TypeScript
- Drizzle is schema-in-TS, more comparable to Vertz in type safety
- Fairer comparison on the type flow axis

### Stack 4: Nest.js + React (separate frontend)
- Nest.js backend (decorators, DI, controllers) + React SPA
- Tests: decorators + DI vs functions + type inference

### Stack 5: Open (no defined stack)
- Prompt doesn't mention any framework
- Agent chooses freely
- Measures: which stack does the AI naturally gravitate toward?

Each stack has:
- `scaffolds/<stack>/` — functional base project with 1 "todos" entity
- CLAUDE.md or README with framework docs (size-controlled across stacks)
- `bun install` / `npm install` pre-executed

---

## Task Catalog

### Tier 1: CRUD Baseline
| ID | Task | What It Tests |
|----|------|---------------|
| T01 | Create "projects" entity with typed fields | Schema definition, wiring, registration |
| T02 | Add enum field "priority" to existing entity | Schema modification, pattern following |
| T03 | Set up typed client and make a query | Client wiring, import resolution |

### Tier 2: Full-Stack Integration
| ID | Task | What It Tests |
|----|------|---------------|
| T04 | Create a page that lists entities | Full-stack: API → data fetching → rendering |
| T05 | Create a form with validation | Form + schema + submit |
| T06 | Add access control (auth + roles) | Auth syntax, middleware/rules |

### Tier 3: Refactoring
| ID | Task | What It Tests |
|----|------|---------------|
| T07 | Add tenant scoping | Schema migration + query filtering |
| T08 | Extract business logic to a service | Dependency wiring, separation of concerns |

### Tier 4: Bug Fixing
| ID | Task | What It Tests |
|----|------|---------------|
| T09 | Fix type error (hidden field leak) | Type system comprehension |
| T10 | Fix failing test | Code comprehension, debugging |

### Tier 5: Complex Features
| ID | Task | What It Tests |
|----|------|---------------|
| T11 | Search + filter with URL state | Query params, filtering, UI state |
| T12 | Cursor-based pagination | Pagination API + UI |

Each task has:
- `task.json` — prompt template (directed + open version), maxTurns, timeout
- `<stack>/scaffold/` — project in its initial state
- `<stack>/tests/` — evaluation test suite (hidden from agent)

---

## Automated Evaluation

Pipeline per run (after agent finishes):

1. **Compile** — `bun run typecheck` / `npx tsc --noEmit`
2. **Lint** — `bunx biome check` / `npx eslint`
3. **Hidden tests** — test suite that validates correct behavior
4. **Static analysis** — count of `as any`, `@ts-ignore`, any in signatures
5. **Semantic checks** — access rules return 403, hidden fields don't leak, etc.

**Composite score** (0-100):

```
score = 30 x compile + 40 x (tests_passed/total) + 15 x type_safety + 5 x lint + 10 x quality
```

---

## Harness Architecture

```
benchmarks/ai-productivity/
  harness/
    runner.ts              # Orchestrates tasks, spawns sandboxes
    claude-runner.ts       # Spawns Claude Code CLI, parses JSON output
    sandbox.ts             # Copies scaffold → temp dir, pre-installs deps
    evaluator.ts           # Compile + test + lint + static analysis
    metrics-collector.ts   # Aggregates metrics from all runs
    report-generator.ts    # Markdown + JSON output
    stats.ts               # Mean, stddev, CI, t-test, Cohen's d
  tasks/
    types.ts               # Task definition interfaces
    catalog.ts             # Registry and loader
    t01-create-entity/
      task.json            # Prompts (directed + open), config
      vertz/scaffold/ + tests/
      nextjs-prisma/scaffold/ + tests/
      nextjs-drizzle/scaffold/ + tests/
      nestjs-react/scaffold/ + tests/
  scaffolds/               # Base templates (copied per task)
    vertz-base/
    nextjs-prisma-base/
    nextjs-drizzle-base/
    nestjs-react-base/
  results/                 # Output (gitignored)
  run.ts                   # CLI entry point
```

### CLI

```bash
# Run 1 task, 1 stack, 1 model
bun benchmarks/ai-productivity/run.ts \
  --task t01 --stack vertz --model sonnet --runs 5

# Run everything
bun benchmarks/ai-productivity/run.ts \
  --task all --stack all --model sonnet,opus --runs 5

# Run open prompt (no defined stack)
bun benchmarks/ai-productivity/run.ts \
  --task t01 --stack open --model sonnet --runs 5

# Generate report from existing results
bun benchmarks/ai-productivity/run.ts --report
```

---

## Implementation Phases

### Phase 1: Harness Core + T01 Vertz Only
- `claude-runner.ts` — spawn Claude Code, parse JSON output
- `sandbox.ts` — copy scaffold, pre-install, clean up
- `evaluator.ts` — compile + test check
- `metrics-collector.ts` — aggregate tokens, cost, turns
- Task T01 scaffold Vertz + evaluation tests
- Output: JSON with metrics, run 3x Sonnet and validate capture

### Phase 2: Multi-Stack (Next+Prisma + Next+Drizzle)
- Base scaffolds for Next+Prisma and Next+Drizzle
- T01 scaffolds + equivalent evaluation tests
- Side-by-side: Vertz vs Next+Prisma vs Next+Drizzle in the same run

### Phase 3: Open Prompt + Nest.js Stack
- Nest+React scaffold
- "Open" version of T01 prompt (no framework mentioned)
- Special evaluation for open: identifies which stack the agent chose

### Phase 4: Reports + Statistics
- `report-generator.ts` — Markdown tables side-by-side
- `stats.ts` — CI, t-test, Cohen's d
- Complete CLI with --task, --stack, --model, --runs, --report flags

### Phase 5: Task Catalog Expansion (T02-T06)
- 5 tasks with scaffolds and tests for all stacks
- Prompt calibration based on learnings from previous phases

### Phase 6: Full Catalog (T07-T12) + Multi-Model
- Complex tasks + Opus runs
- Error classifier (type vs runtime vs logic)
- Report with breakdown by tier, model, and stack

### Phase 7: CI + Historical Tracking
- GitHub Actions runs T01+T04 on each PR (fast subset)
- Trend tracking: cost and success rate over time
- Regression alerts

---

## Verification

- Phase 1: run T01 3x with Sonnet, verify that JSON metrics are captured correctly
- Phase 2: run T01 across 3 stacks, compare side-by-side
- Phase 3: run T01 open 3x, verify that the chosen stack is identified
- Phase 4: generate report, verify p-values and CIs
- Full: run complete catalog (12 tasks x 5 stacks x 2 models x 5 runs = 600 runs), analyze

---

## Reference Files in the Codebase

| Reference | Path |
|-----------|------|
| Existing harness (patterns) | `benchmarks/run.mjs` |
| Report format | `benchmarks/ANALYSIS.md` |
| Vertz scaffold | `examples/entity-todo/` |
| Evaluation test pattern | `packages/integration-tests/src/__tests__/entity-walkthrough.test.ts` |
| Vision (LLM principles) | `VISION.md` |
| Entity access rules | `packages/server/src/auth/rules.ts` |
