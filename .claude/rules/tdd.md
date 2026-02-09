# Strict TDD — One Test at a Time

All framework development follows strict Test-Driven Development.

## Process

1. **Red** — Write exactly ONE failing test (`it()` block) that describes a single behavior
2. **Green** — Write the MINIMAL code to make that one test pass. **Green means ALL of:**
   - Tests pass (`bun test`)
   - Typecheck passes (`bun run typecheck` on changed packages)
   - Lint/format passes (`bunx biome check --write <files>`)
   - If any of these fail, you are NOT green. Fix before proceeding.
3. **Refactor** — Clean up while keeping all checks green
4. **Repeat** — Go back to step 1 with the next behavior
## Rules

- Never write multiple tests before implementing
- Never write implementation code without a failing test
- Each cycle handles one behavior — not a batch
- Run tests after every change to confirm red/green state
- **Green = tests + typecheck + lint.** All three must pass. A test-only green with failing typecheck is NOT green.
- Tests are the specification — if it's not tested, it doesn't exist
- **Before pushing:** Run full quality gates on all changed packages. Never push code that hasn't been typechecked.

## Phase Acceptance Criteria

Every phase in a design or implementation plan MUST define integration tests as part of its acceptance criteria (unless the phase is pure scaffolding with no runtime behavior). When writing plans:

- **Each phase must list its integration test(s)** — what end-to-end behavior is verified when the phase is complete?
- **Integration tests validate the phase works as a whole** — not just unit tests on individual functions, but tests that exercise the feature from the outside in.
- **A phase is not done until its integration tests pass** — shipping code without the defined integration tests is incomplete work.
- **Tests should be concrete and specific** — "add integration tests" is not an acceptance criterion. "Integration test: `createRouter('/users').get('/:id', handler)` responds with 200 and typed JSON body" is.

## Type-Level TDD

Type-only changes (generics, constraints, narrowing) follow the same red-green-refactor cycle. The RED test for a type change is a `@ts-expect-error` directive on code the compiler should reject but doesn't yet.

1. **Red** — Write a `@ts-expect-error` on a wrong-shaped call. The directive is "unused" (the compiler doesn't error) → test fails.
2. **Green** — Tighten the type signature so the compiler rejects the call. The directive is now needed → test passes.
3. **Refactor** — Clean up types while tests stay green.

Positive type tests ("correct shape compiles") are NOT valid RED tests — loose signatures like `unknown` already accept them. Write negative tests first to drive the type constraints.

**Important:** `@ts-expect-error` tests only verify **interface signatures** (the public API). They do NOT catch type errors in the **implementation body**. After GREEN, run `bun run typecheck` to ensure the implementation types are also correct. Type tests + typecheck together cover the full picture.

## Never Skip Quality Gates

- **Never skip or disable linting rules.** Fix the code to comply, don't suppress or weaken the rule. If a rule flags your code, your code is wrong — not the rule. This includes `biome`, `eslint`, or any other configured linter.
- **Never skip or disable type checking.** No `@ts-ignore`, no `as any` casts, no loosening `tsconfig` strictness. If types don't pass, fix the types.
- **Never skip or disable tests.** No `.skip`, no `xit`, no commenting out. If a test fails, fix the code or fix the test — don't silence it.
- **Never skip pre-commit hooks or CI checks.** No `--no-verify`, no `--force`. These gates exist for a reason.
