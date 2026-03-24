# Phase 1b: CLI Integration & Layout Components

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial)
- **Commits:** e5b75424..bbcb6c629
- **Date:** 2026-03-24

## Changes

- packages/cli/src/commands/docs.ts (new) — CLI wrapper commands
- packages/cli/src/cli.ts (modified) — Registered docs subcommand group
- packages/cli/src/commands/__tests__/docs.test.ts (new) — CLI wrapper tests
- packages/docs-framework/src/cli/actions.ts (modified) — Thin action wrappers
- packages/docs-framework/src/layout/header.tsx (new) — Header with navbar + CTA
- packages/docs-framework/src/layout/sidebar.tsx (new) — Sidebar with groups + active highlighting
- packages/docs-framework/src/layout/breadcrumbs.tsx (new) — Breadcrumb navigation
- packages/docs-framework/src/layout/footer.tsx (new) — Footer with link groups + socials
- packages/docs-framework/src/layout/prev-next-nav.tsx (new) — Prev/next page links
- packages/docs-framework/src/layout/table-of-contents.tsx (new) — ToC with depth indentation
- packages/docs-framework/src/layout/theme-toggle.tsx (new) — Light/dark toggle
- packages/docs-framework/src/layout/docs-layout.tsx (new) — Main layout shell
- packages/docs-framework/src/routing/resolve.ts (modified) — Exported shared utilities
- packages/docs-framework/test-compiler-plugin.ts (modified) — Fixed tsx loader

## CI Status

- [x] Quality gates passed at bbcb6c629

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues (injection, XSS, etc.)
- [x] Public API changes match design doc

## Findings

### Blockers (Fixed)

1. **BLOCKER-1: Tests calling components as functions** — All test files used `renderTest(Component({ props }))` instead of JSX `renderTest(<Component prop={val} />)`. Fixed by rewriting all 8 test files.

2. **BLOCKER-2: Duplicate Result type** — `actions.ts` defined a local `Result<T>` instead of using `@vertz/errors`. Fixed by importing from `@vertz/errors`.

### Should-Fix (Fixed)

3. **SHOULD-FIX-1: NavLink name collision** — `header.tsx` had a local `NavLink` shadowing the config type. Renamed to `NavbarLink`.

4. **SHOULD-FIX-2/3: filePathToTitle bugs and duplication** — `sidebar.tsx` duplicated title/path logic with bugs (hyphens not handled, nested paths wrong). Fixed by updating `filePathToTitle` in `resolve.ts` and importing shared utilities.

5. **SHOULD-FIX-4: Missing CLI wrapper tests** — Added 10 tests covering success/error paths for all 3 CLI commands.

6. **SHOULD-FIX-5: docsDevCommand returned ok()** — Unimplemented dev command returned success. Changed to return `err()`.

7. **SHOULD-FIX-6: content: unknown type** — `DocsLayoutProps.content` was typed as `unknown`. Tightened to `string | Node`.

8. **Test compiler plugin fix** — Changed loader from `'ts'` to `'tsx'` so Bun's native JSX handles standalone JSX in test files (the Vertz compiler only transforms JSX inside component functions).

## Resolution

All blockers and should-fix items resolved in commit bbcb6c629. Quality gates clean.
