# Post-Implementation Review: @vertz/db v1.0

- **Feature:** @vertz/db — Type-Safe PostgreSQL ORM
- **Design doc:** `plans/db-design.md`
- **Implementation plan:** `plans/db-implementation.md`
- **Phases:** 7 (PRs #149, #151, #152, #156, #157, #158, #159)
- **Final stats:** 491 tests, 35,064 type instantiations (under 100k budget)
- **Implementer:** ben (vertz-dev-core)
- **Reviewer:** ava (vertz-dev-dx)
- **Lead:** mike (vertz-tech-lead)

## What Went Well

- **Pure TypeScript inference validated by POC at 28.5% of budget, held at 35k through 7 phases.** The POC (closed without merge) proved that the schema-to-type inference approach was viable within the 100k type instantiation budget. Across all 7 phases, instantiations grew from ~28k to 35k — well within budget and with a clear growth trajectory that leaves room for post-v1 features.

- **Strict TDD produced 491 tests with high coverage.** The red-green-refactor cycle was followed for 6 of 7 phases, producing a comprehensive test suite that caught regressions across phases. Test count grew steadily: Phase 3 (261) -> Phase 4 (338) -> Phase 5 (396) -> Phase 6 (441) -> Phase 7 (491).

- **Adversarial PR reviews (Ava) caught real bugs.** Ava's reviews were not rubber stamps. Specific bugs found and fixed:
  - SQL injection vector in aggregate `orderBy` — direction field accepted arbitrary strings (Phase 4)
  - Missing `manyToMany` relation support — `d.ref.many().through()` was not implemented (Phase 4)
  - Nested `includes` stub — relation loading only went one level deep (Phase 4)
  - `migrateStatus` crash on fresh database with no migration history table (Phase 6)
  - Missing snapshot return from `migrateDev` — callers had no way to inspect the result (Phase 5)
  - Missing public exports — several types were defined but not re-exported from the package entry point (Phase 6)

- **PGlite enabled fast integration testing without external database dependencies.** All 491 tests run against PGlite (an in-process PostgreSQL implementation), eliminating Docker or external database setup. Test suite runs in seconds, not minutes.

- **Phase-by-phase pipeline (implement -> review -> fix -> re-review -> merge) prevented compound errors.** Each phase was a self-contained PR with its own review cycle. Bugs found in Phase N were fixed before Phase N+1 started, preventing cascading issues. No phase required reverting work from a previous phase.

- **Design doc Section 7 E2E test provided clear north star acceptance criterion.** The E2E acceptance test was specified in the design doc before any implementation began. Phase 7 implemented this test verbatim — it served as the definitive "done" criterion and validated that all pieces worked together.

- **Bot identity system kept clean git history with proper attribution.** Every commit is attributed to the correct bot (ben for implementation, ava for review fixes, mike for design and integration). The git log tells the story of who did what.

## What Went Wrong

- **TDD violation in Phase 4.** Ben's agent was lost during context compaction and the re-launched agent committed 1,158 lines of implementation code without tests. This was the single biggest process failure in the project. The re-launched agent inherited uncommitted code and pushed it as-is rather than writing tests first. A new rule (`backstage/.claude/rules/tdd-enforcement.md`) was created to prevent recurrence. The tests were written retroactively before the phase was considered complete, but the TDD cycle was broken — the tests were written to match the implementation rather than driving it.

- **Type safety not wired end-to-end.** `DatabaseInstance` methods return `Promise<unknown>` / `Promise<unknown[]>` — the generic type parameters from schema definitions do not flow through to query results. The E2E test had to use 27 `as Record<string, unknown>` casts to work with query results. This is the biggest technical gap in v1.0. The schema layer has excellent type inference (`$infer`, `$insert`, `$update`), but that inference stops at the query boundary. Developers must cast results manually. This undermines the "type-safe" value proposition. Follow-ups #18 and #35 track this.

- **Branded error types not integrated.** `InvalidColumn`, `InvalidFilterType`, and similar branded error types exist as standalone types but are not wired into `SelectOption`, `FilterType`, or `IncludeOption`. This means developers will not see compile-time branded errors when passing invalid column names or filter types — they will only see them when the integration work in follow-up #37 is complete.

- **Security gaps in migration SQL generation.** Enum values and default values are interpolated into DDL strings without escaping. An enum value containing a single quote or SQL metacharacter could produce invalid or malicious SQL. The `ORDER BY` direction in aggregate queries was also not validated at runtime initially (partially fixed in Phase 4 B1 fix, but the pattern exists elsewhere). Follow-ups #16 and #22 track these.

- **Missing acceptance criteria caught late.** Dry-run mode for migrations was specified in the design doc but was missed in the initial Phase 5 implementation. It was caught during review and implemented in Phase 6. Cursor-based pagination from the design doc was not implemented at all (follow-up #15). These gaps indicate that the implementation plan did not systematically cross-reference every design doc requirement.

- **Hard-coded primary key column name `id`.** The relation loader assumes all tables have a primary key column named `id`. Tables with composite primary keys or non-standard PK names will not work with relation loading. Follow-up #14 tracks this.

## How to Avoid It

- **TDD enforcement rule created.** `backstage/.claude/rules/tdd-enforcement.md` codifies the recovery protocol: when an agent is re-launched and finds uncommitted code, it must write tests before committing anything. The orchestrator prompt now includes mandatory TDD instructions, and the recovery scenario has explicit steps (assess, write tests, verify red retroactively, verify green, commit tests first). This directly prevents the Phase 4 failure mode.

- **Type flow verification in implementation plans.** Implementation plans must explicitly specify type flow paths — from schema definition through query builder to query result. Each type flow path becomes a mandatory `.test-d.ts` acceptance criterion. This was already in `tdd.md` as a general principle but was not enforced as a Phase 1 deliverable for @vertz/db. Had the type flow been wired in Phase 1, the 27 casts in the E2E test would have been caught immediately rather than accumulating across 7 phases.

- **Security review checklist for SQL generation.** Add a standing checklist item for SQL injection review on any code that constructs SQL strings. Specifically: all `${value}` interpolations in SQL must use parameterized queries or identifier quoting functions. This should be a reviewer checklist item, not just a general awareness point. Ava's reviews caught the `orderBy` direction issue but missed the enum/default value interpolation — a systematic checklist would catch both.

- **Acceptance criteria cross-reference.** Reviewers should systematically check each acceptance criterion from the ticket and the design doc, not just review the code that was submitted. Ava's adversarial reviews were effective at finding bugs in submitted code but did not catch missing features (dry-run, cursor pagination). Formalizing this as a checklist — "for each requirement in the design doc, verify it is implemented or tracked as a follow-up" — would close this gap.

- **End-to-end type flow as Phase 1 deliverable.** In future packages, wire generic types from definition to consumer in Phase 1. Do not defer type flow to later phases. The @vertz/db experience showed that deferring type flow compounds across phases — each phase adds more API surface that returns `unknown`, and retrofitting generics through all layers becomes increasingly difficult. Phase 1 should include a minimal but complete type flow from schema definition to query result, even if the query builder is trivial.

## Process Changes Adopted

- **Created `backstage/.claude/rules/tdd-enforcement.md`** — mandatory TDD with agent recovery protocol. Covers: what to do when an agent finds uncommitted code, orchestrator prompt requirements, reviewer checklist for TDD compliance in git log. This rule was created directly in response to the Phase 4 TDD violation.

- **Added Type Flow Verification section to `vertz/.claude/rules/tdd.md`** — every generic parameter must have a `.test-d.ts` proving it reaches the consumer. This ensures that type-level guarantees are tested with the same rigor as runtime behavior.

- **Added review follow-ups tracking in `tickets/<project>/_follow-ups.md`** — non-blocking observations from reviews are captured systematically so they do not get lost after merge. 37 follow-up items were tracked across 7 phases, providing a clear backlog for post-v1 work.
