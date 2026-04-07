# Strict TDD — One Test at a Time

All framework development follows strict Test-Driven Development.

## Process

1. **Red** — Write exactly ONE failing test (`it()` block) that describes a single behavior
2. **Green** — Write the MINIMAL code to make that one test pass. **Green means ALL of:**
   - Tests pass (`vtz run test`)
   - Typecheck passes (`vtz run typecheck` on changed packages)
   - Lint/format passes (`bunx oxlint --fix <files> && bunx oxfmt <files>`)
   - If any of these fail, you are NOT green. Fix before proceeding.
3. **Refactor** — Clean up while keeping all checks green
4. **Repeat** — Go back to step 1 with the next behavior

## Rules

- Never write multiple tests before implementing
- Never write implementation code without a failing test
- Each cycle handles one behavior — not a batch
- Run tests after every change to confirm red/green state
- **Green = tests + typecheck + lint.** All three must pass.
- Tests are the specification — if it's not tested, it doesn't exist
- **Before pushing:** Run full quality gates on all changed packages.

## Phase Acceptance Criteria

- Each phase must list concrete integration tests as acceptance criteria
- Integration tests validate the phase works as a whole (outside-in)
- A phase is not done until its integration tests pass
- "add integration tests" is not an acceptance criterion — be specific

## Type Flow Verification

Every phase with generic type parameters MUST include:
- `.test-d.ts` tests proving each generic flows from definition to consumer (dead generic = bug)
- Both positive and negative type tests (`@ts-expect-error` on wrong types)
- Plans must specify type flow paths explicitly
- Reviewers verify: every generic has a test proving it reaches the end user

## Type-Level TDD

1. **Red** — Write `@ts-expect-error` on a wrong-shaped call. Directive is "unused" → test fails.
2. **Green** — Tighten the type signature so compiler rejects the call. Directive now needed → test passes.
3. **Refactor** — Clean up types while tests stay green.

Positive type tests are NOT valid RED tests — loose signatures already accept them. Write negative tests first.

After GREEN, run `vtz run typecheck` — `@ts-expect-error` only verifies interface signatures, not implementation body types.

## Compiler Transform Testing

- **Always test in direct JSX contexts** — every transform test needs cases in JSX attributes (`disabled={expr}`) and JSX children (`{expr}`)
- **Don't rely solely on intermediate variables** — `const data = tasks.data; <div>{data}</div>` doesn't exercise MagicString interaction. Add: `<div>{tasks.data}</div>`
- **Test multi-transform interactions** — isolated transform tests don't catch interaction bugs

## Code Coverage

- **Target: 95%+ line coverage for every source file (aim for 100%).** Run `vtz exec vitest run --coverage` to verify.
- Before pushing, check that all changed source files meet the 95% threshold.
- If a file drops below 95%, add tests for uncovered branches before merging.
- Coverage is measured per-file, not per-package — no file gets a free pass because the aggregate is high.

## Never Skip Quality Gates

- Never skip linting rules — fix the code, not the rule
- Never skip type checking — no `@ts-ignore`, no `as any`
- Never skip tests — no `.skip`, no commenting out
- Never skip pre-commit hooks — no `--no-verify`, no `--force`
