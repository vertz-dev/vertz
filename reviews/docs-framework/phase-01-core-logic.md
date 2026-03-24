# Phase 1: Core Config, Routing, ToC, LLM Output, and Init Scaffolding

- **Author:** implementation agent
- **Reviewer:** adversarial review agent
- **Commits:** b855e551..fb06c115
- **Date:** 2026-03-24

## Changes

- `packages/docs-framework/src/config/types.ts` (new) — TypeScript interfaces for full docs config
- `packages/docs-framework/src/config/define.ts` (new) — Identity function `defineDocsConfig`
- `packages/docs-framework/src/config/load.ts` (new) — Dynamic import of `vertz.config.ts` with runtime validation
- `packages/docs-framework/src/routing/resolve.ts` (new) — Sidebar config to flat route list
- `packages/docs-framework/src/mdx/extract-headings.ts` (new) — Heading extraction for ToC
- `packages/docs-framework/src/mdx/llm-markdown.ts` (new) — MDX to plain markdown conversion
- `packages/docs-framework/src/mdx/frontmatter.ts` (new) — YAML frontmatter parser
- `packages/docs-framework/src/generator/discover.ts` (new) — Recursive .mdx file discovery
- `packages/docs-framework/src/generator/llm-index.ts` (new) — llms.txt / llms-full.txt generation
- `packages/docs-framework/src/generator/build-pipeline.ts` (new) — Build orchestrator
- `packages/docs-framework/src/cli/init.ts` (new) — Project scaffolding
- `packages/docs-framework/src/index.ts` (new) — Public API barrel exports

## CI Status

- [x] Quality gates passed at fb06c115

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Resolved

| ID | Severity | Finding | Resolution |
|----|----------|---------|------------|
| BLOCKER-1 | Blocker | `loadDocsConfig` had no runtime validation | Added validation for non-object, missing name, missing sidebar |
| BLOCKER-2 | Blocker | Tests called `defineDocsConfig` without required `sidebar` | Fixed to include `sidebar: []` |
| SHOULD-FIX-1 | Should-fix | `Bun.write` not awaited in init test | Added `await` |
| SHOULD-FIX-2 | Should-fix | `require()` used in ESM test | Replaced with ESM import |
| SHOULD-FIX-3 | Should-fix | Step counter didn't reset between `<Steps>` blocks | Process each `<Steps>` block separately |
| SHOULD-FIX-4 | Should-fix | Multi-line import stripping incomplete | Improved regex (note: full AST-level stripping deferred to MDX compilation) |
| SHOULD-FIX-5 | Should-fix | Multi-paragraph callout broken blockquote | Each line prefixed with `>` |
| SHOULD-FIX-6 | Should-fix | Single-line callouts not matched | Added single-line regex |

### Deferred (Notes)

| ID | Finding | Reason |
|----|---------|--------|
| NOTE-1 | `NavLink` naming collision | Re-exported as `PageNavLink` — acceptable |
| NOTE-2 | `filePathToTitle` produces "Index" and doesn't handle kebab-case | Frontmatter title override makes this low-priority |
| NOTE-3 | No `exclude` filtering in LLM output | Deferred to Phase 2 (build integration) |
| NOTE-5 | `@vertz/mdx` as unused dependency | Needed in next phase for MDX compilation |

## Resolution

All blockers and should-fix items resolved. Notes deferred to future phases with clear justification.
