# Phase 4: Migrate In-Repo Callers + Docs + Follow-up Issues

## Context

Phases 1–3 make `<pre innerHTML={str} />` work end-to-end. This phase dogfoods the new prop by migrating four framework-internal imperative callers, ships the user-facing docs, and files the two follow-up issues called out in the design doc's Non-Goals.

**Design doc:** `plans/2761-raw-html-injection.md`
**Prereq:** Phases 1, 2, and 3 landed.

The four callers to migrate (confirmed via grep in Rev 2 of the design doc):
- `packages/ui/src/component/foreign.ts:86` — internal "foreign DOM" helper; the surrounding factory is imperative — evaluate whether it can be rewritten as a JSX component. If the caller is non-JSX, mark as "not migrated, rationale: not JSX" and keep the imperative use.
- `packages/component-docs/src/components/code-block.tsx:63` — sugar-high highlighted code. Already a JSX component. Prime migration target.
- `packages/ui-auth/src/oauth-button.tsx:32` — OAuth provider icon. Evaluate: if the icon is SVG markup, the new prop is forbidden on SVG (E0764) — in that case wrap it in an HTML element (e.g. `<span innerHTML={svgString}>`).
- `packages/icons/src/render-icon.ts:15` — generic icon renderer. Same SVG consideration as `oauth-button`.

---

## Task 4.1: Migrate `component-docs/code-block.tsx`

**Files:** (2)
- `packages/component-docs/src/components/code-block.tsx` (modified)
- Its existing test file (if present) — update assertions

**What to implement:** Replace the imperative `(container as HTMLElement).innerHTML = highlighted` pattern with `<pre innerHTML={highlighted} />` (or whichever element the component currently renders). Remove the ref plumbing. Keep className and other props unchanged.

**Acceptance criteria:**
- [ ] Component's rendered output is unchanged (byte-for-byte for the code block content).
- [ ] Component file no longer imports `ref` or mutates `.innerHTML` imperatively.
- [ ] Existing tests pass.

---

## Task 4.2: Migrate `icons/render-icon.ts`

**Files:** (2)
- `packages/icons/src/render-icon.ts` (modified — or rewritten as `.tsx`)
- Its existing tests

**What to implement:** If `render-icon` produces an HTML wrapper (e.g., `<span>`) that contains SVG markup, rewrite it as `<span innerHTML={svgString} />` in a `.tsx` file (so the compiler handles the prop). If the function must stay as a plain `.ts` file (no JSX), the imperative pattern is kept — document why in a comment.

**Acceptance criteria:**
- [ ] Icon rendering still works (exercise via existing tests).
- [ ] If converted to JSX, the file is `.tsx`, and `<span>` wraps the SVG string via `innerHTML` (NOT `<svg>` directly — E0764 forbids innerHTML on SVG elements).

---

## Task 4.3: Migrate `ui-auth/oauth-button.tsx`

**Files:** (2)
- `packages/ui-auth/src/oauth-button.tsx` (modified)
- Its tests

**What to implement:** Replace `span.innerHTML = getProviderIcon(providerId, size)` with JSX: the inner span becomes `<span innerHTML={getProviderIcon(providerId, size)} />`.

**Acceptance criteria:**
- [ ] OAuth button renders the correct icon for each provider.
- [ ] No imperative DOM manipulation remains in the component body.
- [ ] Existing tests pass.

---

## Task 4.4: Migrate or document `ui/component/foreign.ts`

**Files:** (1–2)
- `packages/ui/src/component/foreign.ts` (modified or documented)
- Optional: its tests

**What to implement:** Inspect the function at `foreign.ts:86`. If it's a JSX component, migrate. If it's a low-level helper that accepts an arbitrary HTMLElement and *must* remain imperative (e.g., it's the primitive that the JSX prop itself ends up calling), leave the imperative use and add a one-line comment explaining why.

**Acceptance criteria:**
- [ ] Either migrated to JSX or annotated with rationale.
- [ ] No regression in behavior.

---

## Task 4.5: Docs page in `packages/mint-docs/`

**Files:** (2)
- New markdown page (pick the directory/naming convention used by other JSX prop pages — grep `packages/mint-docs/` for "className" or "style" to locate the right section)
- `packages/mint-docs/mint.json` or its nav index (if manual registration is required)

**What the page must cover:**
1. **Basic usage** — `<pre innerHTML={str} />`.
2. **XSS warning** — big callout at the top: raw HTML in this prop enables script execution if the string comes from user input.
3. **`innerHTML` vs `textContent`** — if you want plain text, pass it as children. The browser escapes HTML when you do that; `innerHTML` does not.
4. **Sanitization** — recommend **`isomorphic-dompurify`** with a concrete example:
   ```tsx
   import DOMPurify from 'isomorphic-dompurify';
   import { trusted } from '@vertz/ui';
   <article innerHTML={trusted(DOMPurify.sanitize(user.bio))} />
   ```
5. **`trusted()` helper** — explain the `TrustedHTML` brand and why adopting `trusted()` now future-proofs against the upcoming `no-untrusted-innerHTML` lint rule.
6. **Mutual exclusion with children** — compile error E0761 example.
7. **Void elements** — `<img innerHTML="x" />` is a type error.
8. **SVG** — `<svg innerHTML="x" />` is compile error E0764; wrap in HTML instead.
9. **React migration** — `dangerouslySetInnerHTML` → `innerHTML` (E0762 redirects).
10. **Example:** full sugar-high syntax-highlighting component.

**Acceptance criteria:**
- [ ] Page lives in `packages/mint-docs/` following the repo convention.
- [ ] Page is registered in the sidebar/navigation.
- [ ] `vtz run build` or equivalent in the docs package passes.
- [ ] All code samples in the page typecheck (verify by pasting into a scratch `.tsx` file or running `vtz run typecheck`).

---

## Task 4.6: File follow-up GitHub issues

**Files:** none (uses `gh` CLI)

**What to file:**

1. **Ref-callback compilation bug** — title something like *"Function refs on JSX elements are not invoked (compiler emits `ref.current = el`)."* Body: describe the bug, reproduce case (`<div ref={(el) => console.log(el)} />` — callback not invoked), expected behavior, scope (fix `process_attr` ref dispatch: check if ref value is a function vs RefObject and emit accordingly). Reference #2761 as discovery source.

2. **`no-untrusted-innerHTML` oxlint rule** — title *"Add oxlint rule: flag dynamic `innerHTML` values that are not `TrustedHTML`."* Body: the `TrustedHTML` scaffolding shipped in #2761 enables this. Rule should warn on `innerHTML={expr}` where `expr`'s type is `string` but not `TrustedHTML`. Reference the `trusted()` helper as the fix.

Add both to the project board (column: Todo). Record the issue numbers in the final PR description.

**Acceptance criteria:**
- [ ] Both issues exist on GitHub with the described scope.
- [ ] Both are on the project board.
- [ ] Issue numbers captured for the PR description.

---

## Phase 4 Done When

- All four (or three, with rationale) caller migrations land.
- Docs page published in `packages/mint-docs/`.
- Both follow-up issues filed and on the board.
- Quality gates green: `vtz test && vtz run typecheck && vtz run lint`.
- Adversarial review at `reviews/2761-raw-html-injection/phase-04-migration-and-docs.md` approves.
- One commit per logical grouping (per-caller migration commits; docs commit; not counting the issue filings).
