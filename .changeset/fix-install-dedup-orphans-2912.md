---
'@vertz/runtime': patch
---

fix(vtz): iterate install dedup until fixpoint so orphan optional binaries collapse with their parent

Closes [#2912](https://github.com/vertz-dev/vertz/issues/2912).

`vtz install`'s `resolver::dedup()` collected every declared range in one pass, then iterated package names once to drop redundant versions. That broke for chains like `esbuild` → `@esbuild/*` platform binaries: after `esbuild@0.27.7` was correctly collapsed into `esbuild@0.27.3`, the `"@esbuild/darwin-arm64": "0.27.7"` range contributed by the just-dropped parent still lingered in the ranges map, so the binary couldn't be dedup'd in the same pass. `hoist()` then promoted the orphan `@esbuild/darwin-arm64@0.27.7` to the root `node_modules`, leaving `esbuild`'s JS host at 0.27.3 while the platform binary resolved at 0.27.7 — esbuild exploded at startup with `Host version "0.27.3" does not match binary version "0.27.7"` and every TS-pipeline CI run after [#2909](https://github.com/vertz-dev/vertz/pull/2909) started failing at the "Build @vertz/ci" step.

Fix: run `dedup` in a loop, rebuilding `ranges_by_name` from the current graph each iteration and exiting when a pass makes no changes. Dropped packages no longer contribute phantom ranges to downstream dedup decisions.
