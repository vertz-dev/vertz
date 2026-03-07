Run the full end-to-end validation suite to ensure nothing is broken across the entire project.

Execute the following steps in order, reporting results as you go:

## 1. Turbo Quality Gates (all packages)

Run from the repository root:
```
npx turbo run lint typecheck test build
```

Report: total tasks passed/total, any failures (note if pre-existing on main).

## 2. Integration Tests

Run from `packages/integration-tests`:
```
bun test
```

Report: tests passed/total.

## 3. Task-Manager E2E (Playwright)

Run from `examples/task-manager`:
```
npx playwright test
```

Report: passed, flaky, failed, skipped counts.

## 4. Benchmarks E2E (Playwright)

The benchmarks app lives in the separate repo at `~/vertz-dev/vertz-benchmarks/`.

**Important:** If the change touches `@vertz/ui-compiler`, `@vertz/ui`, `@vertz/ui-server`, or `@vertz/cli`, copy the updated dist first:
```
rm -rf ~/vertz-dev/vertz-benchmarks/packages/<pkg>/dist
cp -r packages/<pkg>/dist/ ~/vertz-dev/vertz-benchmarks/packages/<pkg>/dist/
```

Then run from `~/vertz-dev/vertz-benchmarks/benchmarks/vertz`:
```
bunx playwright test
```

Report: passed/total.

## 5. Summary Table

After all steps, produce a summary table:

| Suite | Result | Notes |
|-------|--------|-------|
| Turbo quality gates | X/Y passed | ... |
| Integration tests | X/Y passed | ... |
| Task-manager e2e | X passed, Y flaky, Z failed | ... |
| Benchmarks e2e | X/Y passed | ... |

Flag any failure that is NOT pre-existing on main as a blocker that must be fixed before merging.
