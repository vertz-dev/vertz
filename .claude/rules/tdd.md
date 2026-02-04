# Strict TDD — One Test at a Time

All framework development follows strict Test-Driven Development.

## Process

1. **Red** — Write exactly ONE failing test (`it()` block) that describes a single behavior
2. **Green** — Write the MINIMAL code to make that one test pass
3. **Refactor** — Clean up while keeping all tests green
4. **Repeat** — Go back to step 1 with the next behavior

## Rules

- Never write multiple tests before implementing
- Never write implementation code without a failing test
- Each cycle handles one behavior — not a batch
- Run tests after every change to confirm red/green state
- Tests are the specification — if it's not tested, it doesn't exist
