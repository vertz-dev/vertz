---
"@vertz/compiler": patch
"@vertz/cli": patch
---

Replace Dagger with Turborepo for CI pipeline

Migrate from Dagger to Turborepo for improved reliability, caching, and local/CI parity.

**Breaking changes:**
- Removed `codegen` property from `VertzConfig` interface in `@vertz/compiler`. This was an unused configuration option that created a circular dependency. Codegen configuration should be passed directly to codegen functions.

**Key improvements:**
- Content-hash-based caching for deterministic builds
- Identical commands run locally and in CI
- No external engine dependencies (Dagger was causing instability)
- Fixed circular dependency between @vertz/compiler and @vertz/codegen by removing type re-exports

**Migration notes:**
- `bun run ci` now uses Turborepo instead of Dagger
- `bun run ci:affected` runs only tasks for packages changed since main
- All existing package scripts remain unchanged
