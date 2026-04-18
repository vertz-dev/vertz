# Phase 1: `no-narrowing-let` oxlint rule + docs

## Context

Issue #2779: in Vertz `.tsx` components, the documented idiom `let panel: 'code' | 'spec' = 'code'` causes TypeScript's control-flow narrowing to reduce `panel` to the literal `'code'`, so comparisons against `'spec'` fail with TS2367. This is standard TS behavior, not a Vertz compiler bug — the native compiler can't influence what `tsc` reads. Fix: lint rule that flags the pattern and autofixes to `let x: T = v as T`, plus a docs section explaining why. Full rationale: `plans/2779-let-signal-narrowing.md`.

Phase 1 is the only phase. It ships the complete fix end-to-end.

## Prerequisites

- oxlint 1.57.0+ installed (autofix API + `meta.fixable: 'code'` support verified in the design POC).
- Existing `vertz-rules` JS plugin at `oxlint-plugins/vertz-rules.js` with 6 rules.
- Existing test harness `lintFixture(src, rules, filename)` in `oxlint-plugins/__tests__/vertz-rules.test.ts`.

## Tasks

### Task 1.1: Rule implementation + tests + helpers

**Files (5 of 5 budget):**
- `oxlint-plugins/vertz-rules.js` (modified) — add `noNarrowingLet` rule; export via `plugin.rules`.
- `.oxlintrc.json` (modified) — register `vertz-rules/no-narrowing-let: warn`.
- `oxlint-plugins/__tests__/vertz-rules.test.ts` (modified) — add E2E test cases for the new rule.
- `oxlint-plugins/__tests__/helpers.ts` (new or modified) — add `lintFixtureWithFix(src, rules, filename)` helper that spawns `oxlint --fix` on a temp file and reads the fixed content back. (If the existing file is `vertz-rules.test.ts` with inline helpers, extract or colocate — determined during RED phase.)
- `oxlint-plugins/__tests__/tsc-fixture.ts` (new) — minimal `tscFixture(src, filename)` helper that spawns `tsc --noEmit` on an in-memory tsconfig and returns `{ code, message, line }[]`.

**What to implement (TDD, test-first):**

1. **RED: Add failing test cases in `vertz-rules.test.ts` for the new rule.** One test per scenario in the E2E block of the design doc:
   - reports on union-typed `let` in a component body (`.tsx`)
   - autofixes to `let x: T = v as T` form
   - does not fire in `.ts` files
   - does not fire in nested functions
   - does not fire on `const` with union annotation
   - does not fire on non-union annotation (`T[]`, plain `string`)
   - does not fire on destructuring patterns
   - replaces `as const` rather than double-casting
   - wraps `SequenceExpression` initializer in parens
   - handles multi-declarator statements (each declarator fixed independently)
   - autofix output passes `tsc --noEmit` without TS2367
   - double-cast initializer (`let x: T = v as OtherT`) produces `v as OtherT as T` (which trips `no-double-cast` — verified as a useful signal)

2. **Build the two helpers** (`lintFixtureWithFix`, `tscFixture`) enough to make the RED tests runnable. They fail because the rule doesn't exist yet.

3. **GREEN: Implement `noNarrowingLet` in `vertz-rules.js`:**
   - File-extension gate: `extname(context.filename).toLowerCase() !== '.tsx'` → return empty visitor.
   - Visit `VariableDeclarator` nodes.
   - Match: parent `VariableDeclaration.kind === 'let'`, `id` is plain `BindingIdentifier` (not `ObjectPattern`/`ArrayPattern`), `id.typeAnnotation.typeAnnotation.type === 'TSUnionType'`, `init != null`.
   - Scope check: walk `node.parent` until nearest `FunctionDeclaration`/`FunctionExpression`/`ArrowFunctionExpression`/`MethodDefinition`; that function's parent must be `Program` / `ExportNamedDeclaration` / `ExportDefaultDeclaration`.
   - `typeAnnotation` runtime drift: the oxlint `.d.ts` types it as `null`, but runtime has the value. Use `// @ts-expect-error` with a comment pointing to design Rev 2 Unknowns #2.
   - Autofix:
     - `idText = getText(node.id)` up to `:` — or just the identifier name (verify which is cleaner).
     - `annotText = getText(node.id.typeAnnotation.typeAnnotation)` (the union text, without leading colon).
     - `initText = getText(node.init)`.
     - If `node.init.type === 'TSAsExpression'` and its `typeAnnotation` is `TSConstType`, replace `initText` with the inner expression's text (strip `as const`).
     - Compute `maybeParens(initText, initNode)`:
       - Safe (bare): `Literal`, `TemplateLiteral`, `Identifier`, `ThisExpression`, `MemberExpression`, `CallExpression`, `NewExpression`, `ObjectExpression`, `ArrayExpression`, `RegExpLiteral`, `ArrowFunctionExpression`, `FunctionExpression`, `TSAsExpression`, `TSTypeAssertion`, `TSNonNullExpression`, `TSSatisfiesExpression`.
       - Otherwise wrap: `(${initText})`.
     - Replace the `VariableDeclarator`'s text (range `node.start` to `node.end`) with `${idText}: ${annotText} = ${maybeParens(initText, initNode)} as ${annotText}`.
   - `meta: { fixable: 'code' }` on the rule object.
   - Emit the lint message from the design doc.

4. **Register the rule** in `.oxlintrc.json`.

5. **REFACTOR:** Extract helpers (`isSafeForBareCast`, `stripAsConst`, `walkToComponentScope`) if the rule body exceeds ~60 LoC. Keep the rule's `create()` shape consistent with the other six rules in the same file.

**Acceptance criteria:**

- [ ] All new test cases pass.
- [ ] `vtz run lint` on the repo does not produce new warnings beyond the intended ones (run against the 17 known occurrences listed in the design doc; they SHOULD now warn; confirm via `vtz run lint | grep no-narrowing-let | wc -l` — expect ≥17).
- [ ] `oxlint --fix` on a `.tsx` file containing `let panel: 'code' | 'spec' = 'code'` rewrites to `let panel: 'code' | 'spec' = 'code' as 'code' | 'spec'`.
- [ ] `tscFixture` on the autofix output does not report TS2367.
- [ ] `vtz test oxlint-plugins/` is green.
- [ ] `vtz run typecheck` is green (the `@ts-expect-error` is needed only in `vertz-rules.js`, which is `.js` and not typechecked — but any `.ts` helper file must typecheck clean).
- [ ] `oxlint` runs cleanly on `oxlint-plugins/vertz-rules.js` itself (self-lint).

---

### Task 1.2: Docs + docs audit

**Files (2 of 5 budget):**
- `packages/mint-docs/guides/ui/reactivity.mdx` (modified) — add "Union-typed state" section between "State with `let`" and "Derived values with `const`". Audit existing examples and update any that the new rule would flag.
- `.claude/rules/policies.md` (modified) — add a one-line entry to the `vertz-rules` list: `no-narrowing-let — flags union-typed let in components; autofixes to let x: T = v as T`.

**What to implement:**

1. Insert the new section into `reactivity.mdx` using the MDX content from the design doc (§2 "Docs section"). Verify it renders in Mintlify.
2. Audit every `let x: ...` example in `reactivity.mdx` (and any other `guides/ui/*.mdx`) for union annotations. Update to the new pattern, referencing the linked section.
3. Append the rule name + one-sentence description to the `vertz-rules` bullet list in `policies.md`.

**Acceptance criteria:**

- [ ] The new docs section is present and readable; code snippets use the form `let x: T = v as T`.
- [ ] No existing doc example trips the new lint rule when the reader copies it into a `.tsx` component.
- [ ] `policies.md` lists the new rule.
- [ ] `vtz run lint` on `packages/mint-docs/` (if applicable) passes.

---

## Quality gates (must all pass before review)

```bash
vtz test && vtz run typecheck && vtz run lint
```

The `lint` step will now include the new rule firing on the 17 real occurrences flagged in the design doc. Either:
- Leave them as warnings (rule is `warn`, no CI break), **or**
- Autofix them in a follow-up commit within the same PR (cleaner but grows the scope).

Decision at implementation time: if autofixing the 17 occurrences would add <30 lines of diff and doesn't change behavior, include it. Otherwise, file a follow-up issue.

## Review

After quality gates pass, spawn one adversarial review agent. Review target: this phase as implemented (the committed code). Review dimensions: delivers what the ticket asks, TDD compliance, type gaps, security (none expected), API matches design doc. Write review to `reviews/2779-let-signal-narrowing/phase-01-<slug>.md`.

Fix-review loop: address all blockers and should-fix findings. Re-run quality gates. Re-review if the reviewer had blockers. Exit when the reviewer approves.

## After phase (this is the only phase)

1. Rebase `viniciusdacal/gh-2779` on latest `origin/main`.
2. Run full quality gates one more time.
3. Push the branch.
4. Open PR to `main`. PR description includes:
   - Public API Changes: one new oxlint rule (`vertz-rules/no-narrowing-let`) at `warn` severity. No runtime API changes. One new docs section.
   - Summary of Phase 1.
   - E2E acceptance tests passing.
   - Link to design doc and review file.
5. Monitor CI until green.
6. Notify the user only when green and ready for manual merge.
