# Phase 1 — deferred follow-ups

Items identified during the Phase 1 adversarial review that are intentionally
deferred from Phase 1 but should be tracked as GitHub issues (or rolled into
later phases of the drop-classname-utilities plan).

## Should-fix items deferred

### SF-1 — Nested-selector typo-rejection `.test-d.ts`

Add `@ts-expect-error` coverage inside `&:hover` / `@media` blocks so a future
widening of the nested selector's value type is caught. Top-level typo
rejection is already covered.

**Why deferred:** nested-selector value type is the same `StyleBlock` shape as
the top-level; widening one without the other would require an explicit type
change that would surface via code review.

### SF-5 — `variants-object-form.test-d.ts` variant-prop-value rejection

Assert `@ts-expect-error` on (a) unknown variant key, (b) unknown value for a
known variant, (c) `compoundVariants[].<prop>` outside the declared union.

**Why deferred:** the variants typecheck surface is unchanged by Phase 1 —
this is general variants-types hardening that applies to both array and
object forms.

### SF-7 — Shared-table TS `camelToKebab` ↔ Rust `camel_to_kebab` agreement test

Parametrise a table of ~12 camelCase→kebab cases (including
`WebkitTransform`, `MozAppearance`, `MsGridRow`, `msOverflowStyle`,
`paddingInline`, `WebkitBackdropFilter`) and run through both implementations.

**Why deferred:** both implementations are isolated-tested today; a drift would
surface as a visible CSS rendering bug in integration. Nice-to-have hardening.

### SF-8 — Rust `extract_style_block` silent key drop

When the extractor sees a key that is neither a known camelCase CSS property
nor a `&…`/`@…` selector, it currently skips the property. TS runtime does the
same. Phase 1's promise of "typos caught at compile time" needs either
(a) fallback to runtime on unknown keys, or (b) emit a compile error.

**Why deferred:** changing this behaviour is a user-facing behaviour change
(existing valid-but-unknown keys would break), not a bugfix. Belongs in its
own design discussion.

## Nits deferred

### N-1 — `serializeBlock` should skip `null`/`undefined` values

Matches `renderStyleBlock`. Currently two blocks differing only in the
presence of a `{ padding: undefined }` key serialize differently even though
their rendered CSS is identical.

### N-2 — `SelectorKey` accepts lone `'&'` and `'@'`

Template-literal type `` `&${string}` `` permits `${string}` to be empty.
Tighten to require non-empty via a conditional type.

### N-3 — Rust negative test for template-literal expression values

Add an explicit test that `` css({ foo: { color: \`${x}\` } }) `` falls through
to reactive (is not statically extracted).

### N-4 — `hero.tsx` mixes object-form CSS with string-shorthand `keyframes()`

`keyframes()` migration is explicitly out of Phase 1's scope; left for a
later phase of the design doc.

## Pre-existing issues to file as GitHub issues

1. **CSS class-name hash asymmetry between Rust compiler and TS runtime** —
   surfaced by this review, resolved in Phase 1 Blocker 2 fix. No separate
   issue needed (already fixed in this PR).
2. **`landing` badge ping opacity rendered fully opaque on `main`** —
   pre-existing bug, fixed in Phase 1 Blocker 3. No separate issue needed.

All deferred items above *should* be filed as issues before the Phase 1
feature branch merges, per `feedback-create-issues-for-findings.md`. Doing so
keeps visibility on the hardening work without blocking the object-form
migration.
