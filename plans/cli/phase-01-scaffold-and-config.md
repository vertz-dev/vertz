# Phase 1: Package Skeleton and Config Loading

**Prerequisites:** None -- this is the first phase.

**Goal:** Set up the `@vertz/cli` package structure, CLI entry point with Commander, and configuration loading/merging.

---

## What to Implement

1. **Package infrastructure** -- `package.json`, `tsconfig.json`, `bunup.config.ts`, `vitest.config.ts`
2. **CLI entry point** -- `bin/vertz.ts` with `#!/usr/bin/env node`
3. **Commander program** -- `src/cli.ts` with `createCLI()` that registers all command stubs
4. **Public API** -- `src/index.ts` exporting `createCLI` and types
5. **Config defaults** -- `src/config/defaults.ts` with `CLIConfig` type and default values
6. **Config loader** -- `src/config/loader.ts` with `loadConfig()` that discovers and merges `vertz.config.ts`
7. **CI detection utility** -- `src/utils/prompt.ts` with `isCI()` helper
8. **Runtime detection utility** -- `src/utils/runtime-detect.ts` to detect Bun vs Node

---

## Files to Create/Modify

### New Files

```
packages/cli/
├── package.json
├── tsconfig.json
├── bunup.config.ts
├── vitest.config.ts
├── bin/
│   └── vertz.ts
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── config/
│   │   ├── defaults.ts
│   │   └── loader.ts
│   └── utils/
│       ├── prompt.ts
│       └── runtime-detect.ts
```

### Test Files

```
packages/cli/src/
├── __tests__/
│   └── cli.test.ts
├── config/
│   └── __tests__/
│       ├── defaults.test.ts
│       └── loader.test.ts
└── utils/
    └── __tests__/
        ├── prompt.test.ts
        └── runtime-detect.test.ts
```

### Modified Files

- Root `tsconfig.json` -- add `packages/cli` to project references (if using project references)

---

## Expected Behaviors to Test

### Config Defaults (`src/config/__tests__/defaults.test.ts`)

- [ ] `defaultCLIConfig` has `strict: false`
- [ ] `defaultCLIConfig` has `forceGenerate: false`
- [ ] `defaultCLIConfig.compiler.sourceDir` is `'src'`
- [ ] `defaultCLIConfig.compiler.outputDir` is `'.vertz/generated'`
- [ ] `defaultCLIConfig.compiler.entryFile` is `'src/app.ts'`
- [ ] `defaultCLIConfig.dev.port` is `3000`
- [ ] `defaultCLIConfig.dev.host` is `'localhost'`
- [ ] `defaultCLIConfig.dev.open` is `false`
- [ ] `defaultCLIConfig.dev.typecheck` is `true`
- [ ] `defaultCLIConfig.generators` is an empty object

### Config Loader (`src/config/__tests__/loader.test.ts`)

- [ ] `loadConfig()` returns default config when no config file exists
- [ ] `loadConfig()` discovers `vertz.config.ts` in the given directory
- [ ] `loadConfig()` walks up parent directories to find config file
- [ ] `loadConfig()` merges user config with defaults (user values override defaults)
- [ ] `loadConfig()` preserves default values for properties not specified by user
- [ ] `loadConfig()` handles `export default defineConfig({...})` format
- [ ] `loadConfig()` handles plain `export default {...}` format
- [ ] `loadConfig()` supports `vertz.config.js` as an alternative
- [ ] `loadConfig()` supports `vertz.config.mjs` as an alternative
- [ ] `loadConfig()` prefers `vertz.config.ts` over `.js` when both exist

### CLI Program (`src/__tests__/cli.test.ts`)

- [ ] `createCLI()` returns a Commander `Command` instance
- [ ] Program name is `'vertz'`
- [ ] Program has a version string
- [ ] Program registers `dev` command
- [ ] Program registers `build` command
- [ ] Program registers `generate` command
- [ ] Program registers `check` command
- [ ] Program registers `deploy` command
- [ ] Program registers `routes` command
- [ ] Unknown commands produce a helpful error

### CI Detection (`src/utils/__tests__/prompt.test.ts`)

- [ ] `isCI()` returns `false` when `CI` env var is not set
- [ ] `isCI()` returns `true` when `CI=true`
- [ ] `isCI()` returns `true` when `CI=1`
- [ ] `isCI()` returns `false` when `CI=false`
- [ ] `isCI()` returns `false` when `CI=0`

### Runtime Detection (`src/utils/__tests__/runtime-detect.test.ts`)

- [ ] Detects Bun runtime when `Bun` global is available
- [ ] Detects Node runtime when `Bun` global is not available
- [ ] Returns runtime name as a string (`'bun'` or `'node'`)

---

## Quality Gates

After each GREEN:

```bash
bunx biome check --write packages/cli/src/
bun run typecheck
```

---

## Notes

- Commander commands in this phase are **stubs** -- they register the command name and description but don't implement behavior. Each command will be implemented in its own phase.
- **Config loading strategy (validated by Spike 2):** Use dynamic `import()` on Bun (native TS support, ~0.01ms) and fall back to `jiti` on Node (~33ms). Add `jiti` as a production dependency for Node compatibility. Runtime detection (`typeof Bun !== 'undefined'`) determines which approach to use.
- Commander + Ink coexistence was validated by Spike 1 -- Commander handles argument parsing, then `.action()` hands off to Ink. No stdout conflict.
- The `CLIConfig` type extends `VertzConfig` from `@vertz/compiler`. If the compiler package is not ready yet, define a minimal version of `VertzConfig` locally and mark it for replacement.
