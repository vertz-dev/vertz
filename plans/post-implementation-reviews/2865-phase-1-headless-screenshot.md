# Retrospective — Phase 1: Headless Screenshot MCP Tool (#2865)

- **Shipped:** 2026-04-22 as `@vertz/runtime@0.2.78` + `@vertz/create-vertz-app@0.2.78`
- **Scope:** Phase 1 of the 5-phase `plans/2865-agent-visual-handoff.md` vision — delivers `vertz_browser_screenshot` MCP tool. Phases 2–5 (impersonation, overlay, current-tab, full template rollout) still blocked on dependencies (`@vertz/auth` consolidation, compiler dev/prod mode).
- **PRs merged to main (in order):** #2871 POC+design, #2872 artifacts, #2873 chromiumoxide dep + binary-size, #2874 fetcher local-probe, #2910 fetcher download, #2913 pool + chromium spawner, #2915 MCP tool + http route + diagnostics, #2916 create-vertz-app template, #2918 mint-docs, #2919 Linux E2E CI.
- **Support PRs:** #2935 (consolidated changeset), #2936 + #2939 (fix unrelated `'vtz':` changeset bug blocking release).

## What went well

1. **Adversarial review found 10 real blockers that would have broken production.** Task 3b review caught B1 (download buffered instead of streaming — 100 MB memory spike per call), B2 (no SHA-256 format validation — empty string would silently disable integrity check), B3 (zip symlink entries not rejected — path-redirect attack), B4 (multi-process cache race — concurrent `vtz dev` processes would corrupt the zip file). Task 4 review caught B1 (shutdown mid-launch leak for non-initiator awaiters) and B2 (TTL close racing in-flight captures — would tear Chrome out from under a running capture). Task 4 re-review caught NB1 (captures that cloned the Arc before the TTL check but hadn't entered the read guard still hit spurious `ShuttingDown`). Task 5 review caught B1 (bare paths don't navigate from `about:blank` — every single call would fail on day one), B2 (protocol-relative URLs bypass same-origin check), B3 (`shutdown_pool` defined but never wired — Chrome leaks on SIGINT). Every one of these was subtle enough that unit tests didn't catch them; only the reviewer's "walk the state machine with adversarial eyes" approach surfaced them before merge.

2. **Deterministic test harness via `tokio::sync::Notify`.** The initial Task 4 tests used `sleep(5ms)` to "give the launch a chance to start" — classic CI-flake pattern. The review's SF6 prompt forced a rewrite to `launch_entered.notified().await` + gated-launch mode (`release_launch()`). Result: 11 pool tests run deterministically in 70ms total, no timing-based assertions anywhere.

3. **`Arc::strong_count > 1` guard for NB1 is race-free.** Could have used a custom counter or a ref-holding lease pattern; the strong_count check under the state mutex is 4 lines and provably correct because no other `acquire_warm` path can produce a new Arc while we hold the state lock. Shipped the simplest fix that actually works.

4. **`RwLock<Option<Browser>>` on `ChromiumoxideHandle` was the right architecture.** Read guards during capture + write guard during close means close() naturally waits for in-flight captures. Solved B2 AND SF5 (concurrent new_page serialization) with one refactor. The POC originally went with `Mutex<Option<Browser>>` — the review forced the correct shape.

5. **Local-phase workflow held up across 8 tasks.** Each task got its own branch, local adversarial review, fix loop, and only the final PR per task to GitHub. No premature "Phase 1 PR" monstrosity, no lost context between tasks. `.claude/rules/local-phase-workflow.md` is doing its job.

6. **Integration test safety rules prevented CI hangs.** The E2E test (`screenshot_e2e.rs`) uses an in-process fixture server on an ephemeral port, bounded `tokio::time::timeout` on every capture, and `with_deadline` helper on the first test so a future hang fails fast instead of burning a 25-minute job budget.

7. **Autonomous execution across 8 tasks + 5 PRs.** User delegated CI/review/merge authority once; implementation proceeded unattended through Tasks 3b–8 plus 2 fix-up PRs plus the final publish. No pings back except for 3 policy decisions (macOS CI drop, version-bump strategy, deferred follow-ups). The `feedback_autonomous_phase_execution.md` memory pattern is load-bearing.

## What went wrong

1. **Missed changesets on all 8 Phase 1 PRs.** The `Definition of Done` in `design-and-planning.md` lists "Changeset added" but the rule is enforced by human/agent review, not CI. Every one of the 8 PRs merged without a `.changeset/*.md` file; discovered only when the user asked "tá no pr de release?" This meant the whole feature was invisible to the release pipeline and #2902 auto-opened bumping every other feature without mentioning #2865 at all. Caught late, had to open #2935 retroactively to consolidate into one changeset for the whole phase.

2. **Unrelated changeset bug blocked the release pipeline.** Three separate PRs (#2909, #2914, #2934 — all from viniciusdacal) used `'vtz': patch` as the changeset package name. `vtz` is the CLI binary, not an npm package; the actual workspace package is `@vertz/runtime`. The release workflow failed on every push to main with `Found changeset fix-X for package vtz which is not in the workspace`. The version step bailed, `publish` never ran — so even after #2935 landed, `@vertz/runtime@0.2.77` never hit npm. Required #2936 + #2939 to fix the two files, then a merge of #2937 to consume the remaining two changesets and bump straight to `0.2.78`. The feature skipped `0.2.77` on npm entirely.

3. **Initial Task 4 submission had 2 blockers that unit tests couldn't catch.** B1 (shutdown-during-launch Arc leak for non-initiator awaiters) and B2 (TTL close racing in-flight captures) were both state-machine bugs. FakeHandle's no-op `capture()` masked B2 — it only surfaces when the handle actually holds resources that close() tears down. The reviewer flagged this explicitly ("FakeHandle is a no-op"), and the accepted fix (RwLock on `ChromiumoxideHandle` + pool-level `strong_count` guard) is only partially covered by FakeSpawner — the real RwLock semantics rely on the `#[ignore]`d real-Chrome integration test. Acceptable, but it means the unit suite can regress without anyone noticing until the nightly E2E job runs.

4. **Task 5 initially shipped broken for its primary use case.** `capture_tool` passed `url: "/tasks"` directly to `browser.new_page(req.url)`. Chrome has no base URL for a bare path (fresh page is `about:blank`), so navigation fails with "invalid URL." The `TOOL_DESCRIPTION` explicitly advertised paths as the primary input. No integration test covered `capture_tool` end-to-end through the pool — the closest test was `parse_args_accepts_minimal_url` which only asserts the URL survives parsing. Caught at adversarial review; would have been the first thing a user reported.

5. **macOS CI E2E hangs at first `Browser::launch`.** `browser-actions/setup-chrome@v1` on Apple Silicon installs Chrome but doesn't strip Gatekeeper quarantine. The job ran 25 minutes without producing a single test name before getting cancelled by the runner timeout. Dropped macOS from the Phase 1 matrix with a comment in `ci.yml` flagging the investigation. The `remove_quarantine` code in `fetcher.rs` exists but only runs on CfT-downloaded Chrome, not `setup-chrome`-installed Chrome.

6. **Dead PoolError variants + lying WaitCondition.** Initial Task 4 defined `NavigationTimeout`, `PageHttpError`, `SelectorAmbiguous` in the enum without any emitter, and `WaitCondition::{DomContentLoaded, NetworkIdle, Load}` with all three arms collapsing to the same `wait_for_navigation` call. Reviewer called both out as "scope creep on the error enum" and "public enum whose variants are aliases = a lie to consumers." Fixed by removing the dead variants (they'll land with their emitters in a follow-up) and documenting the WaitCondition collapse with a JSDoc note. Lesson: preview enums in public APIs create a contract they can't keep.

7. **Module-static `POOL: OnceCell` dodged design pressure.** Adding `screenshot_pool: Arc<OnceCell<Arc<Pool>>>` to `DevServerState` would have touched ~15 construction sites across `module_server.rs`, `http.rs`, `mcp.rs`, `bridge/mod.rs`, and test fixtures. A module-static OnceCell avoided the churn but left cross-instance bleed for any future in-process multi-server scenario (two `vtz dev` instances share one pool, and the artifact URL bakes in whichever server_port called first). Reviewer flagged as S4; deferred because the feature ships without the multi-server case existing yet. Acceptable, but it's technical debt the *next* feature that needs in-process multi-server will hit.

8. **Adversarial review was the single highest-leverage activity, yet the retro is the first time it's been framed that way.** 10 blockers + 6 significant should-fixes across 5 reviews. Without it, Phase 1 would have shipped with the download-buffer OOM vector, the zip symlink redirect, the multi-process cache corruption, the shutdown Chrome leak, AND the "bare paths don't work on day 1" bug. Net value > compilation + tests + clippy combined for this feature. The rules capture it as "mandatory" but the framing undersells how much it caught.

## How to avoid it

1. **Add `changeset status` CI check.** One `bunx changeset status --since=origin/main` step in `ci.yml` that fails the PR if (a) no changeset was added AND source code changed, OR (b) a changeset references a package not in `.changeset/config.json`. Would have caught all 8 missing Phase 1 changesets AND the 3 `'vtz':` bugs from unrelated PRs. ~20 lines of CI.

2. **Changeset becomes an explicit phase task, not a Definition-of-Done check.** When writing phase implementation plans in `plans/<feature>/`, list "add changeset" as a task (not just a DoD bullet). Agents are better at executing tasks from the plan than checking DoD retroactively.

3. **FakeHandle/FakeSpawner should mirror production concurrency shape.** When a bug depends on RwLock semantics that only the production handle has, the fake handle should simulate the same guard behavior (use an internal `tokio::sync::RwLock<Option<String>>` as a stand-in for Browser). This would have let `b2_long_capture_survives_ttl_expiry` actually exercise the invariant instead of accidentally passing via FakeHandle's no-op `capture()`.

4. **Every new public enum variant needs a test that exercises its discriminating behavior.** The Task 4 `WaitCondition::{DomContentLoaded | Load | NetworkIdle}` with three no-op arms would have been blocked by a test that asserts each variant produces observably different side effects. When it doesn't, the enum is either wrong or the implementation is missing — both are fix-now signals.

5. **Wire preview APIs behind a feature flag or don't ship them.** `NavigationTimeout`, `PageHttpError`, `SelectorAmbiguous` were "we'll need these in Task 5" reservations that shipped as dead code. Next time: either implement the emitter in the same task, or leave the variant out. Public error enums are a contract; reserving variants is a lie.

6. **macOS CI Chrome needs pre-stripped quarantine.** The `screenshot-e2e` job on macos-latest should include a `run: xattr -dr com.apple.quarantine "$(dirname $(which google-chrome))/../MacOS"` step before invoking `cargo test`. Follow-up issue tracked; when this lands, macos re-enters the matrix.

7. **Framing of adversarial review in agent prompts.** The rules call it "mandatory" but the review's actual leverage (catches bugs unit tests cannot) isn't emphasized. Agent prompts for implementation tasks should frame it as "the ONLY mechanism that catches state-machine bugs before they reach main" — stronger wording might prevent future tasks from skipping or rushing the step.

## Process changes adopted

1. **CI check for changeset package names + presence** — tracked as follow-up. Spec: add `changeset status` check to `ci.yml`; parse the output and fail the PR if any changeset targets a package outside `.changeset/config.json`'s fixed group, or if source code changed without any new changeset file.

2. **New memory entry**: when a user merges a feature PR, treat missing changeset as a hard reminder to add one before continuing the phase. Store as `feedback_changeset_reminder.md`.

3. **Phase implementation plans should list "add changeset" as an explicit task** in any plan file that touches published packages. Update the template in `.claude/rules/phase-implementation-plans.md`.

4. **E2E job layout for browser-dependent code**: one-platform E2E on every PR that touches the relevant code, full matrix (Linux + macOS) as a nightly cron job — decouples the 25-min macOS setup from per-PR feedback loops and lets the matrix catch regressions without blocking feature velocity.

## Open follow-ups (tracked, not blocking)

- Wire `fetcher::ensure_chrome` CfT download path (needs pinned SHA-256 per platform)
- Real `dimensions` for `fullPage: true` (decode PNG in `capture_tool` to populate width/height)
- Per-variant `WaitCondition` dispatch via CDP events
- Status-based + DOM-based `AUTH_REQUIRED` (exposes HTTP status from navigation; detects `<input type="password">` primary-element heuristic)
- macOS CI E2E (pre-strip quarantine OR move to self-hosted runner with warm Chrome)
- `Pool` tracks spawned `tokio::spawn(close())` tasks and awaits them in `shutdown()`
- Split `capturedInMs` into `coldStartInMs` + `captureInMs`
- Replace module-static `POOL` with `DashMap<(root_dir, port), Arc<Pool>>` if in-process multi-server scenario ever ships

## P5 dogfooding gate (active 2026-04-22 → 2026-05-06)

Per Phase 1 design doc criterion P5: the next 3 PRs that touch `.tsx` in an examples directory (primarily `examples/linear/src/`) should include a `vertz_browser_screenshot` artifact link in the PR body. Evaluation owner: Matheus. If the window closes without 3 qualifying PRs, fallback target is any in-flight UI-touching work (scaffolded hello-world, landing-page template, or internal tool).
