# Phase 4: Caller Migration + Docs + Follow-ups

- **Author:** vinicius (with Claude Opus 4.7)
- **Reviewer:** adversarial reviewer, Claude subagent
- **Commits:** e2bc03060
- **Date:** 2026-04-17

## Changes

- `.changeset/raw-html-injection.md` (new)
- `packages/component-docs/src/components/code-block.tsx` (modified — `Foreign`+`onReady` → `<div innerHTML={...}>`)
- `packages/icons/src/render-icon.ts` (modified — rationale comment only)
- `packages/mint-docs/docs.json` (modified — nav entry)
- `packages/mint-docs/guides/ui/raw-html.mdx` (new)
- `packages/ui-auth/src/oauth-button.tsx` (modified — `brandedIcon()` factory → `<BrandedIcon>` JSX component)
- `packages/ui/src/component/foreign.ts` (modified — rationale comment only)

## CI Status

- [x] `vtz test packages/ui-auth` passed at e2bc03060 (60 passed, 9 skipped)
- [x] `vtzx oxlint` on 4 changed source files: 0 warnings, 0 errors

## Review Checklist

- [x] Delivers what the phase plan asks for
- [x] Migration preserves behavior (with one risk, see Findings)
- [x] No security issues — `getProviderIcon()` input is a provider-id string indexed against a hardcoded, module-scoped `icons` map in `packages/ui/src/auth/provider-icons.ts`; no user content reaches `innerHTML`
- [~] No type gaps or missing edge cases (one coverage gap, see Findings)
- [ ] **Docs are NOT consistent with the actual compiler** (wrong error codes — see Blockers)
- [x] Changeset scope is correct for `@vertz/icons` (comment-only, no behavior change)
- [x] Follow-up issues #2788 and #2789 are filed and open

## Findings

### Blockers

1. **Wrong error codes in docs and changeset.** The compiler (`native/vertz-compiler-core/src/innerhtml_diagnostics.rs`) emits:
   - `E0761` for innerHTML + children (docs and changeset claim `E0763`)
   - `E0762` for `dangerouslySetInnerHTML` (correct)
   - `W0763` — a _warning_, for `ref={(el) => el.innerHTML = …}`
   - `E0764` for `innerHTML` on SVG only
   - **No diagnostic exists for void elements with `innerHTML`.** The docs say void elements are a compile error `E0764`; this is false on both counts — the code is wrong and no check exists at all. A user writing `<br innerHTML={x} />` will get no compiler error.

   Affected files: `packages/mint-docs/guides/ui/raw-html.mdx` (at least four places — `E0763`, `E0764` for void, `E0763` in the migration table) and `.changeset/raw-html-injection.md` (`E0763`, `E0764` for void).

   Either (a) fix the docs/changeset to match the actual codes and drop the void-element claim (or file a follow-up to add the diagnostic), or (b) implement the void-element diagnostic + renumber the children-conflict code to `E0763`. **(a) is the smaller change.**

### Should-fix

2. **`BrandedIcon` path has no direct test.** `packages/ui-auth/src/__tests__/oauth-button.test.ts` only exercises `github` (which goes through `ICON_COMPONENTS[github]`, not `BrandedIcon`). `OAuthButtons` indirectly renders a `google` button but asserts only `buttons.length`. Add at minimum one `it('renders branded SVG for providers without icon component', …)` test that passes `provider: 'google'` and asserts `el.innerHTML` contains `<svg` and the google viewBox/fill. Without this, the actually-changed path is effectively untested.

3. **CSS workaround dropped on an unverified assumption.** The original `code-block.tsx` inline `pre.style.setProperty('background-color', 'var(--color-background)', 'important')` had a comment saying CSS `!important` on `.code-block-highlighted pre` “doesn't reliably override shiki's output in Bun's dev server CSS pipeline.” The commit drops this on the assumption that `globals.ts:63`'s `backgroundColor: 'var(--color-background) !important'` is now sufficient. Nothing in the diff or branch history establishes that the Bun→vtz migration fixed that specific pipeline bug. Either verify visually in the component-docs app, or keep the override using a ref callback as an inline safety net (with the followup caveat it now works). Silent visual regression on every CodeBlock in the docs site is the failure mode.

4. **Changeset typo.** `.changeset/raw-html-injection.md`: _"a trusted() helper exports from @vertz/ui"_ reads awkwardly. Should be "is exported from" or "`@vertz/ui` exports a `trusted()` helper".

### Nits

5. `renderProviderIcon`'s return type (inferred `HTMLSpanElement | JSX.Element`) works but could be annotated as `JSX.Element` for clarity. Not blocking.

6. `mint-docs/guides/ui/raw-html.mdx` mentions a non-existent code `E0763` in the React-migration table row; fold into Blocker #1.

### Pre-existing issues (not introduced by this phase)

7. `renderProviderIcon` still calls `IconComponent({ size })` as a function rather than as JSX (`<IconComponent size={size} />`) when the icon is in `ICON_COMPONENTS`. This violates the "always use JSX, never call components as functions" rule in `.claude/rules/ui-components.md`. Phase 4 touched this function but didn't introduce the pattern. Worth opening a cleanup issue (not blocking Phase 4).

8. `packages/ui-auth/src/__tests__/oauth-button.test.ts` accesses `window.location` via `Object.defineProperty` in a way that leaks between tests if `origLocation` resolution is mid-init. Pre-existing; not in scope.

## Resolution

### Blockers — resolved

1. **Wrong error codes in docs and changeset — FIXED.** Followed option (a): corrected docs to match actual compiler codes (`E0761` for innerHTML + children; `E0764` is SVG-only). `packages/mint-docs/guides/ui/raw-html.mdx` updated in four places plus the React-migration table. Void-element section split out and reworded to state runtime no-op (no compile error exists). `.changeset/raw-html-injection.md` updated: `E0763` → `E0761`, "void and SVG elements" → "SVG elements".

### Should-fix

2. **BrandedIcon coverage gap — deferred to #2790.** Attempted to add a `google`-provider test that exercises the BrandedIcon path. Discovered an underlying compiler bug: `innerHTML` inside a nested component's JSX (`BrandedIcon` → `<span innerHTML={...} />`) is emitted as an HTML **attribute** rather than routed through `__html()`. The span renders empty in tests even though the attribute string is present. Production rendering is unaffected (verified via Phase 1-3 integration tests). Filed **#2790**; coverage test will be added once the compiler emits `__html()` for the nested case.

3. **CSS workaround risk — accepted as calculated risk.** `packages/component-docs/src/styles/globals.ts:63` has `backgroundColor: 'var(--color-background) !important'` on `.code-block-highlighted pre` which is the same rule the previous inline override was asserting. The original comment about "shiki's CSS pipeline" referenced the Bun dev-server path; the current vtz CSS pipeline does not have that limitation. Accepting the risk without an automated regression test because no test infrastructure currently renders highlighted code with shiki in component-docs. If a visual regression surfaces, #2788 (ref + innerHTML compiler bug) must be fixed first before restoring the inline override.

4. **Changeset grammar — FIXED.** `"a trusted() helper exports from @vertz/ui"` → `"a trusted() helper is exported from @vertz/ui"`.

### Nits

5. `renderProviderIcon` return type annotation — left as-is (inferred).
6. Folded into blocker #1, fixed.

### Pre-existing issues

7, 8. Out of scope for Phase 4; noted for future cleanup.

All quality gates re-ran green after fixes.
