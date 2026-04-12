# Design: Replace bunup with @vertz/build (#2498)

## Context

All framework packages use `bunup` (a Bun-based bundler built on `Bun.build()`) for their build step. To fully remove the Bun dependency from the build chain, we need a replacement that produces identical output (ESM, DTS, source maps) without requiring the Bun runtime.

**27 packages** reference bunup in their build scripts today. 25 have explicit `bunup.config.ts` files; 2 rely on bunup defaults. Configurations range from simple single-entry builds to complex multi-entry builds with custom plugins and post-build hooks.

## API Surface

### Config file: `build.config.ts`

```typescript
import { defineConfig } from '@vertz/build';

// Simple — single entry
export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
});

// Multi-entry with externals
export default defineConfig({
  entry: ['src/index.ts', 'src/router/index.ts', 'src/form/index.ts'],
  dts: true,
  external: ['@vertz/ui', '@vertz/ui/internals'],
  clean: true,
});

// With plugins
import { createVertzLibraryPlugin } from '@vertz/ui-server';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
  clean: true,
});

// Multi-config (array)
export default defineConfig([
  {
    entry: ['src/index.ts', 'src/ssr/index.ts'],
    dts: true,
    outDir: 'dist',
  },
  {
    entry: ['src/bun-plugin/index.ts'],
    dts: true,
    target: 'node',
    outDir: 'dist/bun-plugin',
  },
]);
```

### Types

```typescript
import type { Plugin } from 'esbuild';

interface BuildConfig {
  /** Entry point files relative to package root */
  entry: string[];
  /** Generate .d.ts declaration files (default: true) */
  dts?: boolean;
  /** Output directory (default: 'dist') */
  outDir?: string;
  /** Output format (default: ['esm']) */
  format?: ('esm' | 'cjs')[];
  /** External dependencies (auto-detected from package.json) */
  external?: string[];
  /** esbuild plugins for transform-time hooks (onLoad, onResolve) */
  plugins?: Plugin[];
  /** Post-build hooks — run after bundling, before DTS generation */
  onSuccess?: PostBuildHook | PostBuildHook[] | (() => void | Promise<void>);
  /** Remove outDir before building (default: false) */
  clean?: boolean;
  /** Build target (default: 'neutral') */
  target?: 'browser' | 'node' | 'neutral';
  /** Banner to prepend to output files */
  banner?: string | { js?: string; css?: string };
}

interface PostBuildHook {
  name: string;
  handler: (ctx: PostBuildContext) => void | Promise<void>;
}

interface PostBuildContext {
  outputFiles: OutputFileInfo[];
  outDir: string;
  packageJson: Record<string, unknown>;
}

interface OutputFileInfo {
  path: string;
  relativePath: string;
  entrypoint: string | undefined;
  kind: 'entry-point' | 'chunk';
  size: number;
}

function defineConfig(config: BuildConfig | BuildConfig[]): BuildConfig | BuildConfig[];
```

### CLI invocation

```bash
# In package.json — both forms are equivalent
"build": "vtz build"
```

`vtz build` reads `build.config.ts` from the current directory, runs esbuild for JS bundling, then runs tsc for DTS generation. This is a new subcommand added to the vtz CLI (Rust side), which shells out to esbuild and tsc. In the interim (before the Rust CLI is updated), it can be invoked as `vtzx @vertz/build` using the package's bin entry.

## Implementation

### JS Bundling: esbuild

esbuild (v0.27.3) is already a devDependency in the repo. It supports:
- ESM output format
- Code splitting
- External dependencies
- Tree shaking
- Source maps
- Plugin API (`onLoad`, `onResolve`) — nearly identical to BunPlugin's API
- `--target=bun` for Bun-specific builds (esbuild 0.17+)
- No Bun runtime dependency (Go binary)

### DTS Generation: tsc --emitDeclarationOnly

Each package already has a `tsconfig.json` with `"isolatedDeclarations": true`, which enables per-file declaration emit without full type-checking. We run `tsc --emitDeclarationOnly --outDir dist` per package to generate `.d.ts` files.

**`dts: { inferTypes: true }` migration:** 20 of 25 configs currently use this bunup-specific flag. In the `@vertz/build` API, this option is dropped — `dts: true` (boolean) is the only supported form. Since all packages already use `isolatedDeclarations`, tsc produces equivalent DTS output. The migration mechanically changes `dts: { inferTypes: true }` to `dts: true`. This is an intentional simplification, not a behavior change.

### Plugin Migration

`createVertzLibraryPlugin()` currently returns a `BunPlugin`. esbuild's plugin API is nearly identical, with two important differences:

**1. Return `loader: 'js'`, not `loader: 'tsx'`:** The native Vertz compiler transforms JSX into `_jsx()` calls and strips TypeScript. The output is plain JavaScript. Returning `loader: 'tsx'` in esbuild would cause a double-transform. The migrated plugin must return `loader: 'js'`.

**2. Replace `Bun.Transpiler` in the exclude path:** The current plugin uses `new Bun.Transpiler()` for excluded files (non-reactive `.tsx` files that still need JSX transformation). This Bun-specific API must be replaced with esbuild's built-in JSX transform:

```typescript
// Current (Bun-specific)
if (options?.exclude?.test(args.path)) {
  const transpiled = new Bun.Transpiler({
    loader: 'tsx',
    autoImportJSX: true,
    tsconfig: JSON.stringify({
      compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@vertz/ui' },
    }),
  }).transformSync(source);
  return { contents: transpiled, loader: 'js' as const };
}

// New (esbuild — use esbuild.transform for the exclude path)
if (options?.exclude?.test(args.path)) {
  const { code } = await esbuild.transform(source, {
    loader: 'tsx',
    jsx: 'automatic',
    jsxImportSource: '@vertz/ui',
  });
  return { contents: code, loader: 'js' };
}
```

**3. Source map chaining:** The current plugin inlines source maps as base64 data URLs. esbuild can extract and chain inline source maps when its own `sourcemap` option is enabled. This behavior must be validated during Phase 2 to ensure source maps chain correctly.

**Migrated plugin shape:**
```typescript
// esbuild Plugin (new)
import type { Plugin } from 'esbuild';

export function createVertzLibraryPlugin(options?: VertzLibraryPluginOptions): Plugin {
  const filter = options?.filter ?? /\.tsx$/;

  return {
    name: 'vertz-library-plugin',
    setup(build) {
      build.onLoad({ filter }, async (args) => {
        const source = await readFile(args.path, 'utf-8');

        if (options?.exclude?.test(args.path)) {
          const { code } = await esbuild.transform(source, {
            loader: 'tsx',
            jsx: 'automatic',
            jsxImportSource: '@vertz/ui',
          });
          return { contents: code, loader: 'js' };
        }

        const result = compile(source, {
          filename: args.path,
          target: options?.target,
          hydrationMarkers: true,
        });

        let contents = result.code;
        if (result.map) {
          const mapBase64 = Buffer.from(result.map).toString('base64');
          contents += `\n//# sourceMappingURL=data:application/json;base64,${mapBase64}`;
        }

        return { contents, loader: 'js' };
      });
    },
  };
}
```

### Post-Build Hooks Migration

bunup's `BunupPlugin` hooks (`onBuildDone`) and `onSuccess` callback are used by 3 custom hooks:
- `fixBarrelReExports()` — fixes ESM re-exports in barrel files (may be unnecessary with esbuild — verify during Phase 4)
- `stripBareChunkImports()` — removes unnecessary chunk imports (may be unnecessary with esbuild — verify during Phase 4)
- `stripDeadRequireImports()` — removes dead CJS requires (db package — may be unnecessary if esbuild's ESM output doesn't generate `__require` patterns)

**API flexibility:** `onSuccess` accepts three forms for ergonomic parity with bunup:
- `onSuccess: () => { ... }` — plain function (current db package pattern)
- `onSuccess: { name: 'hook', handler: (ctx) => { ... } }` — named hook with context
- `onSuccess: [hook1, hook2]` — array of hooks

Plain functions are normalized to `{ name: 'custom', handler: fn }` internally. Hooks that need the output file list use the `PostBuildContext` parameter.

### Auto-External Detection

`@vertz/build` reads the package's `package.json` and auto-marks all `dependencies` and `peerDependencies` as external (same as bunup). The `external` config field adds additional externals on top.

### Banner Handling

The `banner` field accepts both a string shorthand and an object:
- `banner: '#!/usr/bin/env node'` — applied to JS output only
- `banner: { js: '#!/usr/bin/env node', css: '/* license */' }` — per-format

**CLI shebang migration:** `@vertz/cli`'s current banner `#!/usr/bin/env bun` changes to `#!/usr/bin/env node` (or `#!/usr/bin/env vtz` once the runtime supports direct script execution). This is a separate decision tracked with the CLI migration in Phase 4.

## Manifesto Alignment

- **Principle 8 (No ceilings):** "If a dependency limits us, we replace it." Bun limits our build portability. We replace it with esbuild (zero runtime dependency beyond a Go binary).
- **Principle 7 (Performance is not optional):** esbuild is the fastest JS bundler available. Build times will be equal to or faster than bunup.
- **Principle 2 (One way to do things):** All packages use the same `@vertz/build` tool with `build.config.ts`. No ambiguity.

## Non-Goals

- **Building a custom bundler in Rust.** That's a future possibility (`vtz build` native) but out of scope. esbuild is fast enough and battle-tested. The `vtz build` subcommand shells out to esbuild for now.
- **Changing the build output format.** Output must remain functionally identical: ESM, DTS, source maps. Chunk boundaries may differ but public exports must be the same.
- **Changing the monorepo build orchestration.** Turbo still orchestrates builds via `vtz run build`. Only the per-package build tool changes.
- **Supporting CJS output.** All packages are ESM-only today. CJS support is not needed.
- **Removing `Bun.Transpiler` from `native-compiler.ts` `compileFallback`.** That's a separate concern for the native compiler package. This design focuses on the build tool replacement only.

## Unknowns

1. **esbuild code splitting parity with Bun.build()** — esbuild's code splitting behavior may differ from Bun's. Chunks may be split differently, leading to different file names. The `fixBarrelReExports` and `stripBareChunkImports` hooks are pattern-based and may need adjustment. **Resolution: verify during Phase 4. Test whether esbuild even needs these workarounds — if not, delete them.**

2. **tsc DTS generation speed** — `tsc --emitDeclarationOnly` may be slower than `@bunup/dts` for large packages. However, all packages use `isolatedDeclarations: true`, which enables fast per-file emit. **Resolution: measure during Phase 1. If too slow, use `--isolatedDeclarations` flag for maximum speed.**

3. **esbuild CJS interop output** — esbuild's ESM output may not generate `__require` / `createRequire` patterns that bunup does. If so, the `stripDeadRequireImports` hook and the `createRequire` shim in `native/vtz/src/runtime/module_loader.rs` (lines 1465-1478) become unnecessary. **Resolution: verify during Phase 4.**

## POC Results

No POC needed. esbuild is well-understood, widely used, and already present in the repo. The plugin API compatibility between BunPlugin and esbuild Plugin has been verified by inspection of the `createVertzLibraryPlugin` implementation. The two differences (loader return value, Bun.Transpiler usage) have clear solutions documented above.

## Type Flow Map

This is a build tool, not a typed runtime API. The only generic is `defineConfig`, which is a straightforward identity function for type checking configs. No complex type flow to trace.

```
defineConfig(BuildConfig) → BuildConfig  // identity, provides autocomplete
defineConfig(BuildConfig[]) → BuildConfig[]  // array variant
```

## E2E Acceptance Test

```typescript
describe('Feature: @vertz/build replaces bunup', () => {
  describe('Given a package with build.config.ts', () => {
    describe('When running vtz build', () => {
      it('Then produces ESM output in dist/', () => {});
      it('Then produces .d.ts declarations in dist/', () => {});
      it('Then .d.ts files are importable and type-check correctly', () => {});
      it('Then marks package.json dependencies as external', () => {});
    });
  });

  describe('Given a package with esbuild plugins (createVertzLibraryPlugin)', () => {
    describe('When running vtz build', () => {
      it('Then the plugin transform is applied to .tsx files', () => {});
      it('Then source maps are generated and chained', () => {});
      it('Then plugin returns loader: js (no double JSX transform)', () => {});
    });
  });

  describe('Given a multi-config build (array)', () => {
    describe('When running vtz build', () => {
      it('Then each config produces output in its own outDir', () => {});
    });
  });

  describe('Given a package with onSuccess post-build hooks', () => {
    describe('When running vtz build', () => {
      it('Then post-build hooks run after JS bundling', () => {});
      it('Then hooks receive the list of output files', () => {});
      it('Then plain function form is supported', () => {});
    });
  });

  // Full monorepo acceptance
  describe('Given the full Vertz monorepo', () => {
    describe('When running vtz run build', () => {
      it('Then all 27 packages build successfully', () => {});
      it('Then vtz run typecheck still passes', () => {});
      it('Then no bunup dependency remains in any package.json', () => {});
    });
  });
});
```

### Output Verification Strategy

After migrating each batch of packages, run a functional comparison:
1. Build with the new tool (`vtz build`)
2. Verify public exports are importable via `vtz run typecheck`
3. Run the full test suite (`vtz test`) — tests import from the built `dist/`
4. For packages with post-build hooks, inspect output files to confirm hooks ran correctly

Byte-identical output is explicitly **not** a goal (esbuild chunks differently). Functional equivalence is verified by typecheck + test suite passing.

## Migration Strategy

The migration is done incrementally. Each phase migrates a batch of packages and verifies the build output.

### Phase 1: Create @vertz/build package
Build the core package with `defineConfig`, esbuild wrapper, tsc DTS generation, CLI binary, auto-external detection, `onSuccess` hooks (all three forms), `banner` (string + object), `clean`, and `target`. Full test coverage.

### Phase 2: Adapt createVertzLibraryPlugin
Update `createVertzLibraryPlugin` in `@vertz/ui-server` to return an esbuild `Plugin` instead of a `BunPlugin`. Key changes:
- Replace `Bun.Transpiler` exclude path with `esbuild.transform()`
- Change `loader: 'tsx'` return to `loader: 'js'`
- Validate source map chaining with esbuild

Update `fixBarrelReExports` and `stripBareChunkImports` to use the `PostBuildHook` API. Test whether esbuild even needs these workarounds — delete if not.

### Phase 3: Migrate simple packages (no plugins, no multi-config)
Migrate ~16 packages with simple configs: `@vertz/core`, `@vertz/schema`, `@vertz/errors`, `@vertz/fetch`, `@vertz/test`, `@vertz/ci`, `@vertz/testing`, `@vertz/agents`, `@vertz/cli-runtime`, `@vertz/desktop`, `@vertz/icons`, `@vertz/og`, `@vertz/openapi`, `@vertz/tui`, `@vertz/codegen`, `@vertz/compiler`.

Also migrate any packages currently using bunup defaults (no `bunup.config.ts`) — create explicit `build.config.ts` files for them.

Migrate in sub-batches of 5-6 packages with full `vtz run build && vtz run typecheck` between batches.

### Phase 4: Migrate complex packages (plugins, multi-config, hooks)
Migrate the remaining ~11 packages that use plugins, multi-config, or post-build hooks: `@vertz/ui-primitives`, `@vertz/theme-shadcn`, `@vertz/docs`, `@vertz/ui-auth`, `@vertz/mdx`, `@vertz/ui`, `@vertz/ui-server`, `@vertz/ui-canvas`, `@vertz/db`, `@vertz/server`, `@vertz/cli`.

These depend on Phase 2 (plugin migration). `@vertz/cli` banner changes to `#!/usr/bin/env node` or `#!/usr/bin/env vtz`.

### Phase 5: Cleanup
- Remove bunup from all `package.json` files (dependencies + devDependencies)
- Update `turbo.json` inputs from `bunup.config.ts` to `build.config.ts`
- Verify and remove the `createRequire` shim in `native/vtz/src/runtime/module_loader.rs` if esbuild output doesn't use it
- Remove `Bun.Transpiler` fallback in `native-compiler.ts` `compileFallback` (or create a follow-up issue)
- Full monorepo build + typecheck + test verification
- Update `CLAUDE.md` build instructions if applicable

## Review Sign-offs

### DX Review — Changes Requested → Resolved

Findings addressed:
1. **`onSuccess` API shape** — now supports plain function, single hook, and array forms
2. **Missing `target: 'bun'`** — dropped from the type; esbuild supports `--target=bun` internally but we map to `'node'` since the goal is removing Bun. The `ui-server` bun-plugin build specifically is addressed in Phase 4.
3. **`dts: { inferTypes }` semantics** — `inferTypes` dropped; `dts: true` is the only form. Documented as intentional simplification.
4. **`banner` type mismatch** — now accepts both `string` and `{ js, css }` object
5. **CLI naming** — changed to `vtz build` subcommand for consistency with the toolchain

### Product/Scope Review — Changes Requested → Resolved

Findings addressed:
1. **Package count** — corrected to 27 (25 with configs + 2 using defaults)
2. **`@vertz/ui-auth` miscategorized** — moved from Phase 3 to Phase 4 (depends on plugin)
3. **`@vertz/docs` and `@vertz/mdx`** — moved to Phase 4 (uses plugin)
4. **Output verification strategy** — added dedicated section with functional comparison approach
5. **`onSuccess` API flexibility** — addressed (see DX review)
6. **CLI shebang migration** — explicitly documented as Phase 4 decision

### Technical Review — Changes Requested → Resolved

Findings addressed:
1. **Blocker: `Bun.Transpiler` in exclude path** — replaced with `esbuild.transform()` (documented with code example)
2. **Blocker: `loader: 'tsx'` double-transform** — changed to `loader: 'js'` (documented in plugin migration section)
3. **`target: 'bun'** — addressed as Phase 4 concern for `ui-server`
4. **`dts: { inferTypes }`** — dropped, documented
5. **`onSuccess` shape** — flexible API supporting all three forms
6. **`banner` type** — flexible API supporting both string and object
7. **Phase 3 batch size** — changed to sub-batches of 5-6 packages
8. **`fixBarrelReExports` / `stripBareChunkImports`** — noted to test if still needed with esbuild
9. **`createRequire` shim cleanup** — explicitly listed in Phase 5
