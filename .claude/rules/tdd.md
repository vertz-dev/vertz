# Strict TDD — One Test at a Time

All framework development follows strict Test-Driven Development.

## Process

1. **Red** — Write exactly ONE failing test (`it()` block) that describes a single behavior
2. **Green** — Write the MINIMAL code to make that one test pass
3. **Quality Gates** — Run linter, formatter, and typecheck
   - `bunx biome check --write <files>` — lint and format
   - `bun run typecheck` — verify no type errors in changed packages
   - Fix any issues before proceeding
4. **Refactor** — Clean up while keeping all tests green
5. **Repeat** — Go back to step 1 with the next behavior

## Rules

- Never write multiple tests before implementing
- Never write implementation code without a failing test
- Each cycle handles one behavior — not a batch
- Run tests after every change to confirm red/green state
- **Run quality gates after every GREEN** — linter, formatter, typecheck must pass
- Tests are the specification — if it's not tested, it doesn't exist

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
