---
'vertz': patch
---

feat(vertz): add `invalidate`, `decline`, `on`, `off` to `import.meta.hot`

Closes [#2812](https://github.com/vertz-dev/vertz/issues/2812).

The `vtz` compiler previously stripped `import.meta.hot` references entirely at build time, so calls to `accept()` / `dispose()` were no-ops under `vtz dev`. The compiler now rewrites `import.meta.hot` to a runtime lookup (`globalThis.__vtz_hot?.(import.meta.url)`) that resolves to a real per-module hot context exposed by the HMR client.

New methods on `ImportMetaHot`:

- `invalidate(message?)` — trigger a full page reload with an optional reason.
- `decline()` — opt out of HMR for the current module; the next update targeting it falls back to a full reload.
- `on(event, cb)` / `off(event, cb)` — subscribe to runtime events: `vertz:beforeUpdate`, `vertz:afterUpdate`, `vertz:beforeFullReload`, `vertz:invalidate`, `vertz:error`.

`send()` (custom client → server events) and `prune()` (cleanup on module removal) are tracked as a follow-up — they require bidirectional WebSocket support and module-removal tracking.
