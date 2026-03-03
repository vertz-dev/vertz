# Debugging the Benchmarks Repo

Common issues encountered when working with the benchmarks repo and how to diagnose them.

## Infinite Page Reload Loop

**Symptom:** The browser reloads the page endlessly. DevTools network tab shows the page loading, then immediately reloading, in a tight loop.

**Root cause:** Bun's dev server serves a reload stub when the client module fails to compile or resolve its imports. The stub is literally:

```js
try{location.reload()}catch(_){}
addEventListener("DOMContentLoaded",function(event){location.reload()})
```

This happens when the `dist/` directory contains stale chunk files from a previous build that no longer match the current entry points.

**How to verify:** Open DevTools → Network → look at the JS bundle content. If it's the reload stub above instead of your actual application code, this is the issue.

**Fix:** Clean-copy the dist from the source repo. Never layer `cp -r` on top of an existing dist — always `rm -rf` first:

```bash
rm -rf /Users/viniciusdacal/vertz-dev/vertz-benchmarks/packages/ui/dist
cp -r /Users/viniciusdacal/vertz-dev/vertz/packages/ui/dist/ /Users/viniciusdacal/vertz-dev/vertz-benchmarks/packages/ui/dist/
```

**Why `cp -r` alone isn't enough:** When the source build produces different chunk hashes (e.g., `chunk-abc123.js` becomes `chunk-def456.js`), `cp -r` copies the new files but leaves the old ones. The old chunks reference imports that no longer exist, causing the bundler to fail silently and fall back to the reload stub.

**Rule of thumb:** Any time you copy a `dist/` directory from the source monorepo to benchmarks, always delete the target first.

## E2E Tests Timing Out (All Client-Side Tests Fail)

**Symptom:** All Playwright tests that depend on client-side JS fail with 30-second timeouts. SSR-only tests (checking raw HTML) still pass.

**Root cause:** Almost always the infinite reload loop above. The page never finishes loading because it's stuck in the reload cycle, so Playwright's `waitForSelector` and `click` actions time out.

**Fix:** Same as above — clean-copy the dist.

## Dev Server Won't Start

**Symptom:** `@vertz/cli dev` fails or the webServer in `playwright.config.ts` can't start.

**Check:**
1. Are all dependencies installed? Run `bun install` in the benchmarks root.
2. Is the port already in use? The default is 4201. Check with `lsof -i :4201`.
3. Is the `@vertz/cli` dist present? The dev server runs from `node_modules/@vertz/cli/dist/vertz.js`.

## General: Copying Dist from Source Monorepo

When updating any package's dist in benchmarks from the source monorepo:

```bash
# Always this pattern — never skip the rm step
rm -rf /path/to/vertz-benchmarks/packages/<pkg>/dist
cp -r /path/to/vertz/packages/<pkg>/dist/ /path/to/vertz-benchmarks/packages/<pkg>/dist/
```

This applies to `@vertz/ui`, `@vertz/cli`, `@vertz/server`, or any other package whose built output is vendored into benchmarks.
