# Phase 3: Migrate first-party call sites

## Context

Phase 1 landed the object-form `css()` pipeline. Phase 2 landed the typed `token.*` helper. Phase 3 migrates every first-party call site in `packages/`, `examples/`, `sites/` from the legacy token-string shorthand (`'p:4'`, `'bg:primary.500'`, `'hover:text:white'`) to the camelCase object form plus `token.*`.

**Scope size at Phase 3 start (2026-04-17):** 138 files, 3014 shorthand strings. Dominant packages: `theme-shadcn` (~55 files, ~1600 strings), `landing` (~25 files), `examples/*` (~25 files), `sites/dev-orchestrator` (~15 files), `packages/create-vertz-app/templates` (205 strings in one file), `packages/ui/src/css/__tests__` (~350 strings — legacy shorthand tests that will be deleted or rewritten).

Design doc: `plans/drop-classname-utilities.md:534-550` for Phase 3 scope and acceptance criteria.

## Migration rules (reference)

- `p:${N}` → `padding: token.spacing[${N}]` (and `px/py/pt/pr/pb/pl/m/mx/my/mt/mr/mb/ml/w/h/gap` etc.)
- `bg:${ns}` → `backgroundColor: token.color.${ns}` when `ns` is a theme key; else `backgroundColor: '${ns}'` when it's a CSS color word.
- `bg:${ns}.${shade}` → `backgroundColor: token.color.${ns}[${shade}]`
- `text:${ns}[.shade]` → `color: ...`
- `border:${ns}[.shade]` → `borderColor: ...`
- `rounded:${size}` → `borderRadius: token.radius.${size}` (theme) or scale lookup.
- `font:${weight|size|family}` → split into `fontWeight` / `fontSize` / `fontFamily` with the appropriate token path.
- `hover:${rest}` → `'&:hover': { <rest-expanded> }`; `focus:` → `'&:focus'`; `active:` → `'&:active'`; `disabled:` → `'&:disabled'`; `dark:` → `'.dark &'` (project-specific, verify).
- Numeric unitless scales map through `token.spacing[N]` / `token.radius` — do NOT inline `'<N>px'`.
- Pseudo prefixes compose: `hover:bg:primary.500` → `'&:hover': { backgroundColor: token.color.primary[500] }`.

Source of truth for the mapping is `packages/ui/src/css/token-tables.ts` and `packages/ui/src/css/shorthand-parser.ts`. The migration script reads from these tables (Phase 4 deletes them after migration is green).

## Tasks

### Task 1: Migration script + self-tests
**Files:** (max 5)
- `scripts/migrate-classnames.ts` (new)
- `scripts/__tests__/migrate-classnames.test.ts` (new)
- `scripts/migrate-classnames-fixtures/input/` (new directory with fixture inputs)
- `scripts/migrate-classnames-fixtures/expected/` (new directory with expected outputs)

**What to implement:**
An AST-based rewrite script. Input: a file path. Output: rewritten source + a migration report. Uses `oxc-parser` or the native compiler's AST. For each `css(...)` or `variants(...)` call, walks the argument object/array literals, finds shorthand string values, maps them via the rule table, rewrites to camelCase object entries with `token.*` references.

Must:
- Preserve unrelated code verbatim (formatting, comments).
- Output TypeScript that passes `tsgo --noEmit`.
- Add `import { token } from '@vertz/ui';` when needed (or `@vertz/ui/css` where appropriate to match existing import style in file).
- Error with a clear diagnostic when a shorthand string maps to no known rule (zero silent skips).
- Be idempotent: running twice produces the same output.

**Acceptance criteria:**
- [ ] Fixtures: 10+ input/output pairs covering padding, colors with shade, colors without shade, pseudo prefixes, font variants, compound variants, array form, nested `&:hover`.
- [ ] Self-test passes: `vtz test scripts/__tests__/migrate-classnames.test.ts`.
- [ ] Running the script on `packages/theme-shadcn/src/styles/button.ts` produces typecheck-clean output.
- [ ] Script exits non-zero when any shorthand string maps to no rule.

---

### Task 2: Migrate theme-shadcn styles
**Files:** (bulk via script — logical max of 5 *review* batches)
- Batch through `packages/theme-shadcn/src/styles/*.ts` (~55 files) via the script.
- `packages/theme-shadcn/src/__tests__/styles.test.ts` (regenerate expected-output fixtures).

**What to implement:**
Run `scripts/migrate-classnames.ts` across theme-shadcn. Commit as one logical batch. Re-snapshot the styles test (it asserts class-name stability for the shipped theme).

**Acceptance criteria:**
- [ ] Zero shorthand strings remain in `packages/theme-shadcn/src/` (post-migration grep).
- [ ] `packages/theme-shadcn` typecheck clean.
- [ ] `packages/theme-shadcn/src/__tests__/styles.test.ts` green.
- [ ] Class names for stable components (button, card, dialog) compare byte-equal pre/post via a class-name snapshot diff (or are justified in PR).

---

### Task 3: Migrate landing site
**Files:** (bulk via script)
- `packages/landing/src/pages/*.tsx`
- `packages/landing/src/components/*.tsx`
- `packages/landing/scripts/generate-highlights.ts` (verify no false positives)

**What to implement:**
Run migration on landing. Landing has visible/public pages — capture Playwright screenshots pre-migration (stash before the batch) and diff post-migration.

**Acceptance criteria:**
- [ ] Zero shorthand remains.
- [ ] Landing typecheck clean.
- [ ] Playwright visual parity (≤ 1px diff on: /, /openapi, /manifesto, /founders).

---

### Task 4: Migrate examples + sites
**Files:** (bulk via script)
- `examples/task-manager/src/styles/*`
- `examples/linear/src/**`
- `examples/entity-todo/src/**`
- `sites/dev-orchestrator/src/**`

**What to implement:**
Run migration on examples and sites. These are primary user-facing reference implementations — they drive the `components.vertz.dev` demo pages.

**Acceptance criteria:**
- [ ] Zero shorthand remains.
- [ ] Each example typechecks.
- [ ] Playwright visual parity on `components.vertz.dev` demo pages.

---

### Task 5: Migrate ui-auth, create-vertz-app templates, remaining consumers
**Files:** (max 5)
- `packages/ui-auth/src/oauth-button.tsx`
- `packages/create-vertz-app/src/templates/index.ts`
- `packages/ui/src/__tests__/css-integration.test.ts`
- Any final stragglers identified by the zero-shorthand grep.

**What to implement:**
Final sweep. The `create-vertz-app/src/templates/index.ts` generates scaffolded apps — its templates emit shorthand as string content. Migrate the emitted strings so new projects use the object form.

**Acceptance criteria:**
- [ ] `rg "'[a-z]+:[a-z0-9.-]+'" packages sites examples | rg "(css|variants|s)\\("` returns zero hits (the Phase 3 completion gate).
- [ ] Full monorepo typecheck clean.
- [ ] Full monorepo test suite green for the packages we touched.

---

### Task 6: Legacy test cleanup
**Files:** (max 5)
- `packages/ui/src/css/__tests__/css.test.ts` — rewrite or delete shorthand tests.
- `packages/ui/src/css/__tests__/css.test-d.ts` — same.
- `packages/ui/src/css/__tests__/variants.test.ts` — same.
- `packages/ui/src/css/__tests__/variants.test-d.ts` — same.
- `packages/ui/src/css/__tests__/s.test.ts`, `packages/ui/src/css/__tests__/shorthand-parser.test.ts`, `packages/ui/src/css/__tests__/shorthand-coverage.test.ts`, `packages/ui/src/css/__tests__/token-resolver.test.ts` — leave as-is (Phase 4 deletes the source files; these tests delete with them).

**What to implement:**
For tests that cover `css()`/`variants()` behavior independent of the token-string parser: rewrite to object form. For tests that specifically cover shorthand parsing: tag with `// REMOVED-IN-PHASE-4` comment or move to a deletion queue.

**Acceptance criteria:**
- [ ] Non-deletable shorthand tests rewritten.
- [ ] Deletion-queue comments in place.
- [ ] Phase 3 zero-shorthand grep passes (excludes tests via `--glob '!__tests__'` if needed; or the tests use object form and pass grep anyway).

---

### Task 7: Adversarial review + quality gates
**Files:** N/A (review deliverable only)
- `reviews/drop-classname-utilities/phase-03-migrate.md` (new)

**What to implement:**
Spawn review agent. Checklist: class-name stability, visual parity evidence, that migration script is deterministic + idempotent, that zero shorthand strings remain under the real acceptance criteria, that the ui-auth package (prebuilt) is correctly re-built if its source changed.

**Acceptance criteria:**
- [ ] Review written and all blockers resolved.
- [ ] Full monorepo quality gates green: `vtz test && vtz run typecheck && vtz run lint`.
- [ ] Pre-push hook passes (trojan-source, lint, build-typecheck, test).

## Open questions before Task 1

- **Script runtime**: `vtz` or plain Node? `vtz` is preferred per `.claude/rules`.
- **AST backend**: native-compiler's `oxc_ast` bindings aren't directly usable from TS. `oxc-parser` npm package is available but may parse differently. Options: (a) spawn the Rust native-compiler with a migration-mode flag; (b) use `@vertz/compiler` if it exposes AST; (c) use `ts` (TypeScript's own parser) for fewest dependencies. **Recommendation**: start with `ts.createSourceFile` since we already depend on it in `@vertz/ui-server` pre-transforms — lowest risk, fastest to land. If AST fidelity is insufficient, escalate to `oxc-parser`.
- **Import placement**: files already importing from `@vertz/ui` get `token` added to the existing import clause. Files without it get a new line. Match surrounding import-style quote preference.
- **Playwright baseline**: the design doc says "pre-migration" snapshots. Capture these BEFORE Task 2 begins. Stash snapshots per batch so we can rewind.

## Phase 3 exit criteria (repeat of design doc)

- `rg "'[a-z]+:[a-z0-9.-]+'" packages sites examples | rg "(css|variants|s)\\("` returns zero hits.
- `vtz run typecheck` clean across monorepo.
- Playwright visual-parity baseline green.
- `vtz test` green across monorepo (for packages we touched; pre-existing load-errors like entity-todo/ssr, build/esbuild are NOT Phase 3 regressions).
