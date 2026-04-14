---
'@vertz/runtime': patch
---

Expand `node:perf_hooks` CJS stub with `PerformanceEntry`, `PerformanceObserver`, `PerformanceObserverEntryList`, and `monitorEventLoopDelay` (required by happy-dom v20.8.3). Add `import.meta.dirname` / `import.meta.dir` polyfill that derives the directory path from `import.meta.url` since deno_core only sets the latter.
