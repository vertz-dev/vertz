# Biome Configuration Decisions

## useSortedKeys — JSON only, not JS/TS

`useSortedKeys` is enabled for JSON config files (tsconfig.json, etc.) but disabled for JS/TS source files and package.json.

**Why not JS/TS:** Alphabetical key sorting in source code can change semantics (e.g., middleware registration order, object spread precedence) and hurt readability when properties follow a logical grouping rather than alphabetical order.

**Why not package.json:** The npm ecosystem has a well-known conventional key order (name, version, type, main, exports, scripts, dependencies) that alphabetical sorting would break.
