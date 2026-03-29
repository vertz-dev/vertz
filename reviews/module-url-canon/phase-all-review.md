# Review: Module URL Canonicalization (#2071)

- **Author:** claude-opus
- **Reviewer:** claude-opus (adversarial)
- **Commits:** ef11c48ec..c30a62c2f
- **Date:** 2026-03-29

## Changes

- `native/vertz-runtime/src/runtime/module_loader.rs` (modified) — Added canonicalization cache, applied to resolve(), fixed file:// early return
- `native/vertz-runtime/src/test/globals.rs` (modified) — DOM class stubs with correct prototype chain
- `packages/errors/src/app-error.ts` (modified) — Intentionally NO Symbol.hasInstance (user subclasses)
- `packages/errors/src/fetch.ts` (modified) — __brands + Symbol.hasInstance on all fetch errors
- `packages/errors/src/entity.ts` (modified) — __brands + Symbol.hasInstance on all entity errors
- `packages/errors/src/tests/symbol-hasinstance.test.ts` (new) — 27 tests for brand checks

## CI Status

- [x] Quality gates passed at c30a62c2f (`cargo test` 1168 pass, `bun test` 292 pass, typecheck clean, lint clean)

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [x] No type gaps or missing edge cases
- [x] No security issues
- [x] Public API changes match design doc

## Findings

### Approved (after fixes)

1. **[blocker → fixed] AppError Symbol.hasInstance breaks user subclasses** — Removed Symbol.hasInstance from AppError. Users subclass it, so the inherited static method would cause `PaymentError instanceof InventoryError → true`. AppError relies on URL canonicalization instead. FetchError/EntityError hierarchies are fine because every leaf class defines its own Symbol.hasInstance.

2. **[should-fix → fixed] DOM stubs missing EventTarget in prototype chain** — Fixed to `EventTarget → Node → Element → HTMLElement` matching the real DOM spec.

3. **[should-fix → fixed] file:// specifier early return bypassed canonicalization** — Now parses to file path, canonicalizes, and converts back.

4. **[should-fix → acknowledged] InfraError hierarchy not branded** — Intentionally out of scope. Infrastructure errors are internal and not involved in the cross-module instanceof failures described in #2071.

5. **[nit → acknowledged] Boilerplate repetition** — Accepted. A helper function would add indirection for a pattern that is self-documenting and grep-friendly. Each class's brand array is unique and must be manually verified.

## Resolution

All blocker and should-fix findings addressed in commit c30a62c2f. No remaining blockers.
