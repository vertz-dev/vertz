# Phase All: className JSX Prop Adoption

- **Author:** viniciusdacal
- **Reviewer:** claude-opus (adversarial)
- **Commits:** 5ef455cd..e34bc86e (7 commits)
- **Date:** 2026-03-15

## Changes

### Core Runtime (Phase 1)
- `packages/ui/src/jsx-runtime/index.ts` (modified) — accept `className`, map to DOM `class`, `className` takes precedence
- `packages/ui-server/src/jsx-runtime/index.ts` (modified) — same pattern for SSR VNode output
- `packages/ui/src/jsx-runtime/__tests__/jsx-runtime.test.ts` (modified) — 4 new tests
- `packages/ui/src/jsx-runtime/__tests__/jsx-types.test-d.ts` (modified) — 1 new type test
- `packages/ui-server/src/__tests__/server-jsx-runtime.test.ts` (new) — 3 tests

### Compiler + SSR Shim + applyAttrs (Phase 2)
- `packages/ui-compiler/src/transformers/jsx-transformer.ts` (modified) — `className` -> `class` in `processAttribute` (intrinsic elements only)
- `packages/ui-server/src/dom-shim/ssr-element.ts` (modified) — `setAttribute('className', ...)` maps to `class`
- `packages/ui-primitives/src/utils/attrs.ts` (modified) — `applyAttrs` handles both `className` and `class`
- `packages/ui-server/src/bun-plugin/image-transform.ts` (modified) — `case 'className':` added
- `packages/ui-compiler/src/__tests__/integration.test.ts` (modified) — 3 new tests

### Component Props (Phases 3-5)
- `packages/ui/src/router/link.ts` — reversed precedence: `className` primary, `class` deprecated
- `packages/ui/src/image/image.ts` + `types.ts` — same pattern
- All 14 `packages/theme-shadcn/src/components/*.ts` files — `className` primary, `class` deprecated
- All 9 `packages/theme-shadcn/src/components/primitives/*.ts` files — type interfaces updated
- All 9 `packages/ui-primitives/src/*/...composed.tsx` files — `className` primary, `class` deprecated
- `packages/ui-auth/src/avatar.tsx`, `user-avatar.tsx`, `user-name.tsx` — same pattern
- `packages/icons/src/render-icon.ts` + `types.ts` — same pattern

### Examples + Docs (Phase 6)
- All example files migrated from `class=` to `className=`
- All documentation files updated
- `.claude/rules/ui-components.md` updated

## CI Status

- [ ] `dagger call ci` passed at `<pending>`

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (tests before/alongside implementation)
- [ ] No type gaps or missing edge cases — **see findings**
- [ ] No security issues (injection, XSS, etc.) — clean
- [x] Public API changes match design doc

## Findings

### Blocker

**B1: `applyAttrs` has inconsistent precedence when both `className` and `class` are present**

File: `packages/ui-primitives/src/utils/attrs.ts` lines 16-29

When an `attrs` object contains BOTH `className` and `class`, both values are independently merged into the DOM `class` attribute (additive). This is inconsistent with every other layer where `className` takes precedence and `class` is ignored:
- Client JSX runtime: `className` wins, `class` skipped
- Server JSX runtime: `className` wins, `class` skipped
- Compiler: only one can be written per JSX element
- Link, Image, all theme components: `className ?? classProp`

In `applyAttrs`, if called with `{ className: "a", class: "b" }`, the element gets `class="a b"` (both merged). Every other layer would produce `class="a"`.

While the dual-key scenario is unlikely in practice (callers typically pass one or the other), the inconsistency will cause confusion when debugging and violates the documented precedence rule.

**Fix:** Add precedence logic before the loop, matching the JSX runtime pattern:
```ts
const resolvedClass = attrs.className ?? attrs.class;
// Then inside loop: if key is 'class' and attrs.className != null, continue
```

### Should-Fix

**S1: `create-vertz-app` scaffold templates still use `class=` everywhere (23+ occurrences)**

File: `packages/create-vertz-app/src/templates/index.ts`

The scaffold templates — the code new users see on their first `create-vertz-app` run — still use `class=` instead of `className=`. This directly contradicts the migration goal. New projects will start with the old convention, teaching the wrong pattern from day one. This includes both inline JSX template strings (the CONVENTIONS.md content embedded in the template) and the actual CRUD app code (lines 777-992).

**S2: `sites/landing/` not migrated (178 occurrences across 15 files)**

Files: `sites/landing/src/components/hero.tsx`, `nav.tsx`, `founders.tsx`, `why-vertz.tsx`, `the-stack.tsx`, `glue-code.tsx`, `footer.tsx`, `faq.tsx`, `schema-flow.tsx`, `token-lines.tsx`, `type-error-demo.tsx`, `vertz-logo.tsx`, `manifesto.tsx`, `copy-button.tsx`, `get-started.tsx`

The entire landing site still uses `class=` in JSX. While this is "internal" code and the compiler handles both, it's inconsistent with the stated goal: "All docs show `className`" and "Zero occurrences of `class=` in JSX attributes in examples." The landing site is the public face of the framework.

**S3: No tests for `className` on theme-shadcn components or ui-primitives composed components**

Files: `packages/theme-shadcn/src/__tests__/components.test.ts`, `packages/theme-shadcn/src/__tests__/skeleton.test.ts`, `packages/theme-shadcn/src/__tests__/avatar.test.ts`, `packages/theme-shadcn/src/__tests__/breadcrumb.test.ts`, `packages/theme-shadcn/src/__tests__/table.test.ts`

All existing theme tests still call components with `class: 'value'` (the deprecated prop). Zero tests verify that `className: 'value'` works on any theme-shadcn component or ui-primitives composed component. The new `className` prop is only tested at the JSX runtime level and on `Link`.

While the deprecated `class` path is verified by existing tests, the NEW primary prop has no test coverage on any component. At minimum, each component should have one test confirming `className` is accepted and applied.

**S4: `OAuthButton` internal JSX still uses `class=` (line 126)**

File: `packages/ui-auth/src/oauth-button.tsx` line 126

```tsx
class={button({ provider: providerVariant, mode: iconOnly ? 'iconOnly' : 'full' })}
```

While this is internal JSX (not a user-facing prop) and the compiler maps it correctly, the design doc states Phase 6 should migrate all JSX. The `OAuthButton` component was touched in this branch (user-facing props on other ui-auth components were updated) but this internal JSX was missed.

### Nit

**N1: `OAuthButtonProps` does not expose `className`/`class`**

File: `packages/ui-auth/src/oauth-button.tsx` lines 91-97

Unlike every other UI component (`Avatar`, `UserAvatar`, `UserName`, `Button`, etc.), `OAuthButtonProps` does not accept a `className` or `class` prop. Users cannot customize the button's classes. This is a pre-existing limitation (not introduced by this PR) but is now more visible given the systematic `className` adoption across all other components.

**N2: `image-transform.ts` does not enforce `className` > `class` precedence**

File: `packages/ui-server/src/bun-plugin/image-transform.ts` lines 265-271

The `case 'className': case 'class':` fallthrough means whichever appears last in source attribute order wins (overwrites the `className` variable). If someone writes `<Image className="a" class="b" .../>`, the result depends on attribute iteration order. In practice, this edge case is extremely unlikely (users won't use both on a compiled `<Image>`), and the compiler's `processAttribute` only processes one at a time. Still, the precedence is undefined where every other layer defines it.

**N3: Design doc status says "Draft" but implementation is complete**

File: `plans/classname-jsx-prop.md` line 3

The design doc still has `Status: Draft`. Should be updated to reflect the implementation is complete.

**N4: Minor inefficiency — `setAttribute('class', ...)` called twice in JSX runtimes**

Files: `packages/ui/src/jsx-runtime/index.ts` lines 104-111, `packages/ui-server/src/jsx-runtime/index.ts` lines 94-100

When only `className` is present and `class` is absent (the common case going forward), the `resolvedClass` is set correctly and the class is applied. When both are present, processing the `className` key sets `class`, and processing the `class` key is correctly skipped. However, when only `class` is present (deprecated path): `resolvedClass = attrs.className ?? attrs.class = attrs.class`. Processing `className` key doesn't happen (not in attrs). Processing `class` key: `attrs.className != null` is false, so `resolvedClass != null` sets `class`. This is correct and efficient.

The only double-set happens when both are present: `className` key sets it, `class` key is skipped. No actual bug here, just noting the logic flow is correct.

## Resolution

Pending author response to findings.
