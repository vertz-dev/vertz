# Phase 3: Migrate Call Sites — Adversarial Review

- **Branch:** feat/migrate-classnames-call-sites
- **Commits:** 031e44d92..6ff1be5b0 (11 commits, 206 files changed, +5190/-3189)
- **Reviewer:** adversarial-bot
- **Date:** 2026-04-17

## Scope Verified

- Read the full Phase 3 plan doc (`plans/drop-classname-utilities/phase-03-migrate-call-sites.md`) and every commit on the branch.
- Reviewed the migration script: `scripts/migrate-classnames/{mapper,rewriter,generator,run,migrate-templates}.ts` and its 117 self-tests + 12 fixture pairs.
- Ran the Phase 3 exit grep `rg "'[a-z]+:[a-z0-9.-]+'" packages sites examples | rg "(css|variants|s)\("` and inspected every non-builtin hit.
- Spot-checked migrated files: `packages/ui-auth/src/oauth-button.tsx`, `packages/theme-shadcn/src/styles/{alert,button,input,drawer}.ts`, `packages/create-vertz-app/src/templates/index.ts`, `sites/dev-orchestrator/src/components/nav-bar.tsx`, several `examples/linear/**`.
- Compared pre-migration shorthand → CSS pipeline (`packages/ui/src/css/token-resolver.ts:446-527`) with the migration's `mapper.ts:mapRaw()` output.
- Ran the migration script (via Bun) on `packages/theme-shadcn/src/styles/input.ts` and confirmed it still produces a 1-site change → file was never re-run after 8ef586cb8 added mixed-array support.
- Checked pre-built `packages/ui-auth/dist/` mtimes: `index.js` at 23:08 post-dates source edits at 22:42 — rebuild confirmed. `dist/` is gitignored, so freshness is local-only but present.
- Typecheck: `cd packages/ui && npx tsgo --noEmit` clean (exit 0). `cd packages/theme-shadcn && npx tsgo --noEmit` clean (exit 0).
- Tests: `vtz test` in `packages/ui` (2756 passed), `packages/theme-shadcn` (136 passed), `scripts/migrate-classnames` (117 passed). Full repo not run (not a blocker per plan — scope is changed packages).
- Lint: `vtz run lint` completed with 1032 warnings (pre-existing from `vertz-rules`) and 0 errors.

## Blockers

### B1. `transition:colors` / `transition:all` / `transition:shadow` migrated to literal invalid CSS strings

**Severity:** semantic regression in 20+ files, including shipped package `@vertz/ui-auth` and user-facing templates in `@vertz/create-vertz-app`.

The old pipeline expanded `'transition:colors'` via `token-resolver.ts:461-481` into:
```css
transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms …, border-color 150ms …, …;
```

The migration script's `mapper.ts:mapRaw()` for property `transition` (valueType `'raw'` in `token-tables.ts:186`) **blindly quotes the value** — emitting `transition: 'colors'` verbatim. `colors` is not a valid CSS transition value, so the browser falls back to `all 0s` (no animation).

Confirmed regressions:
- `packages/ui-auth/src/oauth-button.tsx:65` — OAuth button colour hover animations are dead.
- `examples/linear/src/components/{issue-card,issue-row,label-picker,label-filter,project-card,status-filter,view-toggle,auth-guard,manage-labels-dialog}.tsx` — all of Linear's hover colour transitions.
- `examples/task-manager/src/app.tsx:36,52`.
- `examples/entity-todo/src/app.tsx:50`.
- `sites/dev-orchestrator/src/components/nav-bar.tsx:29`.
- `packages/create-vertz-app/src/templates/index.ts:955,1313,1531,1558` — brand-new scaffolded projects inherit the broken styles as source code strings.
- `examples/linear/src/components/manage-labels-dialog.tsx:49,59` and `examples/task-manager/src/pages/settings.tsx:39` — `transition: 'all'` (should expand to `all 150ms cubic-bezier(...)`).

**Fix:** mapper must add a `mapTransition()` branch that expands `none/all/colors/shadow/transform/opacity` aliases the same way `token-resolver.ts:461-481` does, then re-run the script on every affected file and rebuild `packages/ui-auth/dist/`.

---

### B2. `tracking:*` (letter-spacing) migrated to invalid CSS values

Same class of bug as B1. `token-resolver.ts:484-494` maps `tracking:tight` → `-0.025em`, `wide` → `0.025em`, `widest` → `0.1em`, etc. The migration script leaves them as literal strings:

- `packages/theme-shadcn/src/styles/drawer.ts:190` → `letterSpacing: 'tight'`
- `packages/theme-shadcn/src/styles/alert.ts:30` → `letterSpacing: 'tight'`
- `examples/linear/src/components/status-column.tsx:26` → `letterSpacing: 'wide'`
- `examples/task-manager/src/pages/task-detail.tsx:43` → `letterSpacing: 'wide'`
- `packages/create-vertz-app/src/templates/index.ts:1772` → `letterSpacing: 'wider'`

Browsers accept `letter-spacing: normal` and lengths (`px`, `em`, `%`). They do NOT accept `tight`/`wide`/`wider` — the declaration is dropped silently.

---

### B3. `grid-cols:<N>` migrated to numeric string, losing `repeat()` expansion

`token-resolver.ts:497-501` maps `grid-cols:2` → `repeat(2, minmax(0, 1fr))`. Migrated output emits `gridTemplateColumns: '1'` / `'2'` which CSS treats as 1-column/2-column in the `<track-list>` grammar only if interpreted as a single track — actually `'1'` as grid-template-columns is invalid (requires a unit or keyword) and `'2'` same.

- `examples/linear/src/pages/projects-page.tsx:23` → `gridTemplateColumns: '1'`
- `examples/linear/src/components/loading-skeleton.tsx:73` → `gridTemplateColumns: '1'`
- `examples/task-manager/src/pages/settings.tsx:33` → `gridTemplateColumns: '2'`

All three example layouts lose their multi-column grids.

---

### B4. theme-shadcn migration is INCOMPLETE — 574 shorthand strings remain across 43 files

Commit `8002012ae` migrated theme-shadcn at 22:02 UTC. Mixed-array support was added to the rewriter later in `8ef586cb8` (feat: handles mixed arrays, spreads, and selector unwrap). Dev-orchestrator was re-run post-fix (commit `271a1bfa7`), but **theme-shadcn was never re-run**.

Proof: running the current rewriter on `packages/theme-shadcn/src/styles/input.ts` produces a valid object-form output with 1 rewritten site — the file is partially migrated (line 38 `'transition:colors'`, line 41 `[DARK]: [bgOpacity('input', 30)]`, etc.).

Impact per file (sample):
- `packages/theme-shadcn/src/styles/button.ts` — not touched by the migration commit at all; 100% array-form shorthand intact.
- `packages/theme-shadcn/src/styles/alert.ts:33` — `alertDescription` still uses `['text:muted-foreground', 'text:sm', { '&': {...} }]`.
- `packages/theme-shadcn/src/styles/drawer.ts:193-204` — `drawerFooter` still uses mixed array.
- 40 more files with similar partial migration.

The Phase 3 completion gate says "Zero shorthand strings remain in `packages/theme-shadcn/src/`". Current count: **574**. Runtime still works because the shorthand parser hasn't been deleted yet (Phase 4), but Phase 4 CANNOT delete it while 574 strings still depend on it.

**Fix:** re-run `bun scripts/migrate-classnames/run.ts packages/theme-shadcn/src/styles` and commit. Re-snapshot `packages/theme-shadcn/src/__tests__/styles.test.ts`. Verify `alert.ts:30` `letterSpacing: 'tight'` issue from B2 is addressed in the new version.

---

### B5. packages/landing NOT migrated at all (344 shorthand strings, Task 3 marked done)

`git log main..HEAD -- packages/landing` returns zero commits. The plan's Task 3 was marked complete but no commit touched `packages/landing/src`.

Confirmed shorthand still present in:
- `packages/landing/src/components/highlighted-code.ts` (line with `['color:#7A9B6D', 'text:sm']`)
- `packages/landing/src/components/openapi-features.tsx`, `features.tsx` — `codeWrap: ['p:4', …]`
- `packages/landing/src/styles/globals.ts`, many pages.

The plan's Task 3 also requires "Playwright visual parity (≤ 1px diff on: /, /openapi, /manifesto, /founders)" — there is no evidence this was run. No snapshots added to the branch.

---

### B6. `packages/ui-auth/src/oauth-button.tsx` is a prebuilt package — dist mtimes look OK but there is no verification the emitted CSS is equivalent

`dist/index.js` was rebuilt at 23:08 (source edited 22:42). Good. However, given B1, the oauth-button's dist carries the invalid `transition: colors` value baked into the compiled CSS. Whatever rebuild pipeline was used did NOT catch this (CSS validator isn't part of the build).

**Fix:** after B1 is fixed, rebuild `packages/ui-auth` and verify the emitted CSS contains `color 150ms cubic-bezier(...)` etc. rather than `colors`.

## Should-fix

### S1. Migration script has no fixture / test covering transition aliases, tracking, grid-cols, aspect

Every regression above has the same root cause: the mapper treats `raw` valueType as "quote literally" but the old token resolver had special-case expansions for `transition`, `tracking`, `grid-cols`, `aspect`, and `inset`/`top`/etc. Because no fixture drives those paths, the bug was invisible to the 117 self-tests.

**Fix:** add fixture `13-raw-aliases.tsx` covering `transition:colors`, `transition:all`, `tracking:tight`, `tracking:wider`, `grid-cols:3`, `aspect:square`, `aspect:video`. Expected output must contain the expanded CSS values.

### S2. `inset:<N>` / `top:<N>` / `bottom:<N>` / `left:<N>` / `right:<N>` migration loses spacing scale lookup

`token-resolver.ts:504-514` maps `top:4` etc. via `SPACING_SCALE` (so `top:4` → `1rem`). Current mapper emits `top: '4'` which is invalid CSS (`top` needs a length/percentage/keyword; `4` with no unit is rejected outside `line-height`). I did not find an obvious post-migration occurrence in the branch diff (most uses are `top: '0'` which is valid), but any `top:4` / `inset:2` in un-migrated theme-shadcn files (B4) will silently break when re-migrated.

**Fix:** bundle into the fix for B1/B2 — add a `mapRawKnownProperty()` with per-property logic matching `token-resolver.ts:447-526`.

### S3. `convertMixedArray` reorders cascade

The rewriter flattens `[string-shorthand, { '&': {...} }, string-shorthand]` into `{ <all-shorthand-entries>, <all-object-entries> }`. With last-wins dedup, the string-shorthand-after-object case can change which declaration the browser applies.

Concrete example I built manually: `['text:sm', { '&': { fontSize: '14px' } }, 'text:lg']` — original CSS output orders the `text:sm → text:lg` declarations then appends the `& { font-size: 14px }` nested rule (which is the same specificity and overrides everything). Migrated output dedups `fontSize` to `lg` only, then appends the same nested `&` rule. Final result is the same in this case, but the property-overlap rules are subtle.

No smoking-gun regression found, but the transformation is not provably equivalent for arbitrary inputs. At minimum, document the invariant (e.g. "a later string shorthand with the same property as an earlier string shorthand wins; object-literal properties at the base level never share a key with a string shorthand in real code") and add a fixture that tests the case.

### S4. `migrate-templates.ts` silently skips templates that throw

```
try { result = rewriteSource(unescaped, 'synthetic.tsx'); }
catch (err) { console.error(`  skipping template: ${err instanceof Error ? err.message : err}`); return inner; }
```

If a template has an unknown shorthand or an unsupported array element, the script logs a warning and LEAVES THE TEMPLATE AS-IS. `packages/create-vertz-app/src/templates/index.ts` has 205 shorthand strings; a silent skip means users scaffolding new apps will get the legacy API without anyone noticing. Even though the final committed file shows it migrated, a future re-run silently tolerates regressions.

**Fix:** default to erroring; require a `--allow-skip` flag for explicit opt-in. Print a summary at the end that lists skipped templates with their error message.

### S5. `ensureTokenImport` blows up on aliased imports but does not unalias

`rewriter.ts:303-306` throws if the file imports `token` aliased. For the migration this probably never fires, but the error tells the user to resolve manually — there is no reference to what the script will do if someone re-runs after alias replacement. Low priority but worth a doc string.

### S6. Mapper's `mapBorder` loses zero-width case

`mapper.ts:323-329`: `border:0` → `borderWidth: '0px'`. Valid CSS, but the original shorthand had `border:0` meaning `border-width: 0` — both render the same. Non-issue but worth noting in fixtures.

## Nits

### N1. `packages/ui/README.md:<line>` still uses `s()` shorthand example

```
return <div style={s([`w:${percent}%`, 'bg:green.500', 'h:4'])} />;
```

This is documentation rendering the legacy API. Phase 5 doc task will catch it, but keeping in sync with Phase 3 would improve clarity.

### N2. `packages/mint-docs/guides/llm-quick-reference.mdx` still shows `css({ card: ['bg:card', 'rounded:lg', 'p:4'] })`

Same as N1 — Phase 5 scope but flagging.

### N3. `examples/task-manager/DX_JOURNAL.md` mentions shorthand as a gotcha

Historical journal — leave as-is.

### N4. `scripts/migrate-classnames/generator.test.ts` and `mapper.test.ts` are solid but `fixtures.test.ts` should exercise idempotency by running each fixture input through the rewriter twice

Currently the rewriter.test has one idempotency test (line 23-34 of rewriter.test.ts) but that's a single hand-written case. Running all 12 fixtures through twice would harden the contract.

### N5. `rewriter.ts:271-292` — `ensureTokenImport` re-parses the source after MagicString to scan imports

Minor: this does a second `ts.createSourceFile` pass. For large files this is measurable. Could be avoided by extracting import info during the initial visit. Low priority.

## Approval

**CHANGES REQUESTED.**

B1-B6 are all merge-blockers. B1-B3 are runtime regressions in shipped code (ui-auth dist), user-facing templates (create-vertz-app), and flagship example apps (linear, task-manager). B4 and B5 mean Phase 3's exit criterion ("zero shorthand strings remain") is not met for the two largest migration targets. B6 is not separately blocking if B1 is fixed.

Root cause analysis:
1. The mapper's "raw" valueType was naive — the old token resolver had five special-case expansions (`transition`, `tracking`, `grid-cols`, `aspect`, `inset`/positions) that were not ported to the migration script (S1).
2. The migration commits were ordered such that theme-shadcn ran BEFORE the mixed-array / spread support was added, and nobody re-ran the script after the capability upgrade (B4).
3. Landing was simply forgotten — ticket was ticked without any file changes (B5).
4. No class-name stability diff was captured before/after any migration batch (plan Task 2 ac#4) — I cannot verify the HMR/cache invariant claim. Recommend adding a snapshot diff script that hashes every generated class name before and after a migration batch.

To unblock:
1. Fix the mapper's raw-alias handling (B1/B2/B3/S1/S2), add fixture `13-raw-aliases.tsx`.
2. Re-run the script on `packages/theme-shadcn/src`, `packages/landing/src`, all previously-migrated files (idempotent so safe), and rebuild `packages/ui-auth`.
3. Re-run `vtz test && vtz run typecheck && vtz run lint` across the whole monorepo (Phase 3 completion gate requires this).
4. Capture a class-name stability diff between pre- and post-migration for at least `button`, `dialog`, `card` theme-shadcn components.

Once these land I will re-review.
