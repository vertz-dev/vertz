# Biome Configuration Decisions

## useSortedKeys — JSON only, not JS/TS

`useSortedKeys` is enabled for JSON config files (tsconfig.json, etc.) but disabled for JS/TS source files and package.json.

**Why not JS/TS:** Alphabetical key sorting in source code can change semantics (e.g., middleware registration order, object spread precedence) and hurt readability when properties follow a logical grouping rather than alphabetical order.

**Why not package.json:** The npm ecosystem has a well-known conventional key order (name, version, type, main, exports, scripts, dependencies) that alphabetical sorting would break.

## Custom GritQL Plugins (`biome-plugins/`)

All plugins use `warn` severity (except `no-ts-ignore` which is `error`) because GritQL plugins currently don't support `biome-ignore` suppressions or per-file overrides. Warnings serve as guardrails without blocking CI.

### no-internals-import (warn)
Flags `import ... from '@vertz/core/internals'`. Only `@vertz/testing` should access internal APIs — the 2 warnings in that package are expected.

### no-ts-ignore (error)
Bans `@ts-ignore`. Use `@ts-expect-error` instead — it fails when the suppressed error is fixed, preventing stale suppressions.

### no-double-cast (warn)
Flags `as unknown as T` double casts. Usually means the types need rethinking. Legitimate in test mocks (creating fake objects) and some internal schema operations (enum exclude/extract).

### no-throw-plain-error (warn)
Flags `throw new Error(...)` — prefer VertzException subclasses for proper HTTP error responses. Legitimate in framework setup code (module assembly, env validation) and test assertions where plain Error is appropriate.
