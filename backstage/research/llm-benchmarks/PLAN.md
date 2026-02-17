# Framework Benchmarking with LLMs — Plan

> Issue: [#357](https://github.com/vertz-dev/vertz/issues/357)
> Phase: 1 (Plan & Prompts)

## Objective

Benchmark how well LLMs perform when writing code across different frameworks. The core hypothesis: **Vertz's explicit, type-safe, no-magic API design enables LLMs to produce correct code on the first prompt more often than other frameworks.**

This validates our core positioning ("First TypeScript stack built for LLMs") with data. Results feed into [#351](https://github.com/vertz-dev/vertz/issues/351) (messaging revision) and [#354](https://github.com/vertz-dev/vertz/issues/354) (blog plan).

---

## Scope

### Frameworks to Compare

| Category | Framework | Justification |
|----------|-----------|---------------|
| **Target** | Vertz | Our framework — the baseline for "built for LLMs" |
| **Competitors** | Next.js / React | Dominant full-stack choice |
| | NestJS | Enterprise TypeScript framework |
| | Fastify | Performance-focused Node.js framework |
| | tRPC | Type-safe API (similar value prop) |
| | Prisma | ORM comparison for @vertz/db |

### LLMs to Test

| Model | Provider |
|-------|----------|
| Claude Sonnet | Anthropic |
| GPT-4o | OpenAI |
| Gemini Pro | Google |
| MiniMax | MiniMax (our workhorse) |

---

## Tasks (7 Benchmark Scenarios)

Each task must be executed **identically** across all frameworks to ensure fair comparison. Prompts are defined in `prompts/`.

1. **Define a schema and validate input** — Schema definition + runtime validation
2. **Create a CRUD API endpoint** — REST endpoints for a resource
3. **Set up auth (JWT + RBAC)** — Authentication + role-based access control
4. **Create a domain with relations** — Entity with relationships (1:n, n:m)
5. **Build a full-stack feature** — API + client + UI integration
6. **Handle errors with typed error responses** — Error handling patterns
7. **Set up a multi-service architecture** — Service-to-service communication

---

## Metrics

| Metric | Description |
|--------|-------------|
| **First-prompt success rate** | Does the code compile and pass tests on the first try? |
| **Token efficiency** | How many tokens to reach a working solution? |
| **Iteration count** | How many back-and-forth corrections needed? |
| **Error quality** | When it fails, are the errors helpful enough for self-correction? |

---

## Directory Structure

```
backstage/research/llm-benchmarks/
├── PLAN.md                    # This file
├── prompts/
│   ├── 01-schema-validation.md
│   ├── 02-crud-api.md
│   ├── 03-auth-jwt-rbac.md
│   ├── 04-domain-relations.md
│   ├── 05-fullstack-feature.md
│   ├── 06-typed-errors.md
│   └── 07-multi-service.md
└── data/                      # (Phase 2) Raw benchmark results
    └── README.md
```

---

## Phases

### Phase 1: Plan & Prompts (This PR)
- [x] Create directory structure
- [x] Define exact prompts for 7 tasks
- [x] Document framework versions to test
- [x] Document LLM versions to test
- [ ] Open PR

### Phase 2: Test Harness (Future)
- Build automated test harness to run prompts
- Define success criteria (compiles? tests pass?)
- Set up environment for each framework

### Phase 3: Execution
- Run benchmarks across all framework/llm combinations
- Collect metrics
- Generate raw data

### Phase 4: Analysis & Publishing
- Generate comparative report with data tables
- Write blog post: "We benchmarked 6 frameworks with 4 LLMs — here's what happened"

---

## Quality Gates

Before each benchmark run:
```bash
# Verify prompts are identical across frameworks
turbo run lint
```

---

## Notes for Future Phases

- **Framework versions:** Pin to latest stable versions at time of benchmark
- **LLM versions:** Use latest available (API versions may differ)
- **Success criteria:** Code must compile without errors + pass basic smoke test
- **Isolation:** Each framework test runs in clean environment to prevent cross-contamination
- **Cost tracking:** Track API costs per LLM for ROI analysis
