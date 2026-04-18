---
'@vertz/ui-server': patch
'vertz': patch
'@vertz/runtime': patch
---

refactor: rename vtz plugin system for honesty

Dev is vtz; production build uses a Bun-shaped factory whose purpose (not
runtime) drives its name.

**Breaking changes:**

- `@vertz/ui-server/bun-plugin` subpath removed. Use `@vertz/ui-server/build-plugin`.
- `vertz/ui-server/bun-plugin` subpath removed. Use `vertz/ui-server/build-plugin`.
- `createVertzBunPlugin` → `createVertzBuildPlugin`.
- `VertzBunPluginOptions` → `VertzBuildPluginOptions`.
- `VertzBunPluginResult` → `VertzBuildPluginResult`.
- `vtz --plugin` CLI flag removed (only Vertz is supported now).
- `ReactPlugin` removed from Rust (including `PluginChoice::React` config,
  `.vertzrc` handling, `package.json` auto-detect, and embedded React
  fast-refresh assets).

**Dead-code cleanup:**

- All six `bun-plugin-shim.ts` files deleted from examples, benchmarks, and
  first-party packages. These were orphans — no `bunfig.toml` referenced them.
- `docs/fullstack-app-setup.md` deleted (documented a setup that no longer worked).
