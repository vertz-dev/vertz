# SDK Schema Integration Post-Implementation Retrospective

**Feature:** SDK Schema Integration — form() auto-extracts validation from generated SDK
**Branch:** `feat/sdk-schema-integration`
**PR:** #500
**Issues:** #486, #494, #495, #496, #497, #498, #499
**Phases:** 6
**Packages:** `@vertz/ui`, `@vertz/compiler`, `@vertz/codegen`, `@vertz/cli`, `@vertz/integration-tests`, `entity-todo-example`, `@vertz/ui-compiler`

---

## What went well

**The design doc was accurate and complete.** The 6-phase plan mapped directly to implementation. The API surface (function overloads on `form()`, `SdkMethodWithMeta`, duck-typed `validate()`) shipped exactly as designed. The type flow map (`SdkMethod.meta.bodySchema → form() → validate() → FormInstance.error()`) was implemented without deviation.

**ts-morph POC succeeded.** Unknown 4.1 in the design doc questioned whether ts-morph could extract field-level info from resolved `SchemaLike<T>` types. It could. The navigation path `propType → parse() → call signature → return type → getProperties()` worked reliably for `createInput`, `updateInput`, and `response` schema types. `resolvedFields` populated correctly for string, number, boolean, and optional modifiers.

**Duck-typed ParseError handling was the right call.** `validate()` checks for `.issues` array on errors without importing `@vertz/schema`. This avoids cross-package coupling and `instanceof` failures across package boundaries. The integration test with real `@vertz/schema` confirmed duck-typing works end-to-end.

**Function overloads enforced the "if it builds, it works" principle.** `form(sdkWithoutMeta)` is a compile error — no silent no-validation path. The type tests (`form.test-d.ts`) cover both positive and negative cases. This is the kind of DX guarantee that makes the framework LLM-friendly.

**Adversarial reviews caught real issues.** Reviews across all 6 phases surfaced findings around runtime safety in `validate()`, missing `SdkMethodWithMeta` export, and the need for strict example schemas. These were fixed before merge.

**The E2E acceptance test proved the full vertical.** The integration test in `packages/integration-tests/` uses only public package imports and validates: auto-schema extraction, explicit schema override, validation error mapping, and the compile-time negative case. All passing.

---

## What went wrong

**Entity generators were implemented but never wired into the pipeline.** `EntitySchemaGenerator` and `EntitySdkGenerator` were written as classes with full test coverage, but were never called from `runTypescriptGenerator()` in `generate.ts`. Codegen produced 7 files instead of 11. The `schemas/` and `entities/` directories were simply missing. This was only discovered when running `vertz codegen` end-to-end — unit tests on the generators passed, but the pipeline never invoked them.

**Generated files were initially force-committed to git.** The first approach was `git add -f` on generated SDK files. This violated a fundamental principle: generated code should be produced by the build pipeline, not tracked in source control. Required a full rework to wire `vertz codegen` into the test script and remove files from git tracking.

**The CLI codegen command had 5 distinct bugs, each discovered sequentially:**
1. `createCompiler()` called with no args — compiler config from `vertz.config.ts` was never passed
2. `await import(configPath)` can't load `.ts` files in Node.js — needed jiti
3. jiti not found by Node.js — bun workspace stores packages in `.bun/` cache, not standard `node_modules/`. Had to hoist jiti to root `devDependencies`
4. `interopDefault: true` in jiti merges default export, stripping the `codegen` named export
5. `vertz.config.ts` imported `defineConfig` from `@vertz/compiler` — jiti under Node.js couldn't resolve workspace packages. Switched to JSDoc type comments

Each bug was only discovered after fixing the previous one. The CLI codegen command had never been tested in a real workspace environment.

**CI binary resolution failure.** The `vertz` binary in `node_modules/.bin/` doesn't resolve in CI when `bun install` runs before `turbo build`. The symlink target (`dist/vertz.js`) doesn't exist at install time. Exit code 127. Fixed by calling `bun node_modules/@vertz/cli/dist/vertz.js codegen` directly, bypassing the symlink and shebang.

**Typecheck failure caught only at push time.** `ResolvedCodegenConfig` was passed where `GeneratorConfig` was expected — missing `options` field. The pre-push hook caught it, but local `bun test` didn't (tests use runtime, not static analysis). Had to amend the commit.

**Compiler mkdir missing.** `Compiler.generate()` tried to write to `.vertz/generated/boot.ts` but the output directory didn't exist. One-line fix (`await mkdir(resolve(outputDir), { recursive: true })`) but it blocked everything until diagnosed.

**Obsolete snapshots from rebase.** The openapi-generator test had 4 stale snapshot entries that CI rejected. Not related to our changes — just rebase debris. Required `vitest run --update` to clean up.

**The plan called for 3 PRs but shipped as 1.** The design doc specified PR 1 (ui), PR 2 (compiler/codegen), PR 3 (entity-todo). All 6 phases landed in a single PR (#500). This made review harder and the diff larger (37 files, 1610 insertions).

---

## How to avoid it

**Run E2E codegen command after implementing generators, not just unit tests.** The generator classes had full test coverage, but nobody ran `vertz codegen` in a real project until the very end. Unit tests on generators verify output; E2E tests verify the pipeline invokes them.
- **Action:** Add an integration test that runs the full codegen pipeline and asserts on file count / file paths, not just individual generator output.

**Design docs should include a "Pipeline Integration" section.** The design doc specified the generated output in detail but said nothing about: how codegen is invoked, where config lives, how CI runs it, whether generated files are committed or gitignored. These questions consumed more debugging time than the feature logic itself.
- **Action:** Add "Pipeline Integration" to the design doc template in `design-docs.md`. Required fields: invocation method, config location, CI strategy, git tracking policy.

**CLI commands need workspace integration tests.** Five sequential bugs in the codegen CLI command. Each was trivial individually but formed a dependency chain that took hours to unravel. None would have survived a single integration test that runs `vertz codegen` in a workspace project and asserts on output.
- **Action:** Add CLI integration tests that invoke the binary in a temp workspace project. Test the full config → compile → generate pipeline.

**Never commit generated files.** Generated code must be produced by the build/test pipeline and gitignored.
- **Action:** Add to project rules: "Generated code is always gitignored. Codegen must be wired into the build or test pipeline."

**Run `bun run typecheck` before committing, not just `bun test`.** Tests exercise runtime behavior; typecheck catches structural mismatches like `ResolvedCodegenConfig` vs `GeneratorConfig`.
- **Action:** Already enforced by TDD rules ("Green means tests + typecheck + lint"), but the developer skipped typecheck during iterative debugging. The pre-push hook was the safety net — it worked, but earlier is better.

---

## Process changes adopted

1. **Pipeline integration is a first-class phase.** Wiring generators into the build pipeline, configuring CLI commands, and ensuring CI compatibility is not "obvious wiring" — it's a phase with its own acceptance criteria. Future features that involve codegen must include an explicit "Pipeline Integration" phase.

2. **CLI binary calls in CI should bypass `.bin` symlinks.** Use `bun node_modules/@vertz/cli/dist/vertz.js` instead of the `vertz` binary. Symlinks depend on install-time state; direct paths depend on build-time state (which turbo's `^build` guarantees).

3. **Generated files are never committed.** This is now enforced by `.gitignore` patterns and the codegen-before-test pipeline. If a generated file appears in `git status`, something is wrong.

---

## Metrics

| Metric | Value |
|--------|-------|
| Total commits | 7 (on feature branch) |
| Files changed | 37 |
| Lines added | ~1,610 |
| Lines removed | ~230 |
| Tests added | ~47 (runtime) + ~10 (type-level) |
| Packages touched | 7 |
| CI fix iterations | 3 (binary resolution, snapshot cleanup, initial typecheck) |
| CLI bugs discovered sequentially | 5 |
| Phases | 6 of 6 complete |

---

## Known limitations

1. **`update` operations don't get `.meta.bodySchema`** — `update(id, body)` takes 2 arguments, doesn't fit `SdkMethod<TBody, TResult>` (single-arg callable). Update forms still need explicit schema.
2. **Generated schemas validate types only, not constraints** — `s.string()` not `s.string().min(1).max(255)`. Column constraints (max length, email format) require piping metadata through the IR — deferred.
3. **No partial schema override** — Can't extend auto-schema with extra client-side rules. Must write a full custom schema.
4. **`query()` integration via `.meta.queryKey` not implemented** — Separate concern, tracked separately.
5. **Date fields generate `s.string()`** — JSON transport delivers ISO strings, not Date objects. Documented in design doc as intentional.
