# Phase Implementation Plans

## After Design Approval → Break Into Phase Files

Once a design doc is fully approved (three sign-offs + user sign-off), create a self-contained markdown file for each phase in `plans/<feature>/`:

```
plans/<feature>/
├── phase-01-<slug>.md
├── phase-02-<slug>.md
└── phase-03-<slug>.md
```

## Phase File Format

Each phase file must be **self-contained** — an agent should be able to pick it up and implement it without reading the design doc or other phase files.

```markdown
# Phase N: <Phase Name>

## Context
Brief summary of the feature and what this phase delivers.
Link to design doc for full context.

## Tasks

### Task 1: <description>
**Files:** (max 5)
- `path/to/file1.ts` (new)
- `path/to/file2.ts` (new)
- `path/to/file3.test.ts` (new)

**What to implement:**
Concrete description of what this task does.

**Acceptance criteria:**
- [ ] Criterion 1
- [ ] Criterion 2

---

### Task 2: <description>
**Files:** (max 5)
...
```

## Rules

1. **Max 5 files per task.** This keeps changes small, reviewable, and prevents context window bloat during implementation. If a task needs more than 5 files, split it into multiple tasks.

2. **Each phase file is self-contained.** Include enough context that a different agent can implement it without asking questions. Reference the design doc for deep background, but include all necessary API signatures, types, and patterns inline.

3. **Tasks within a phase are sequential.** Each task builds on the previous one. The first task in a phase should establish the foundational types/interfaces, subsequent tasks build on them.

4. **Acceptance criteria are concrete and testable.** Not "it works" — specific assertions, type checks, or behavioral descriptions.

5. **List files explicitly.** Every task states which files it creates or modifies. This makes the scope visible at a glance.

6. **Include test files in the file count.** A task that creates `parser.ts` and `parser.test.ts` uses 2 of its 5-file budget.

## Why

- **Context window management.** Agents working on a task only need to load the phase file + the ≤5 files they're touching. No need to hold the entire design doc or all phases in context.
- **Parallelization.** Different agents can work on different tasks (within dependency constraints) without stepping on each other.
- **Review granularity.** Each task produces a reviewable, committable unit of work.
- **Progress tracking.** Checkboxes in the phase file show exactly where implementation stands.
