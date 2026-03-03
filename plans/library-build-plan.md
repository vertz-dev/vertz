# Plan: Vertz Library Compilation Plugin (Issue #759)

## Context

Library packages (`@vertz/ui-primitives`, `@vertz/theme-shadcn`, third-party) can't use the full Vertz DX — `let` for signals, JSX templates, computed `const`. The compiler only runs at app build time. This blocks migrating ui-primitives to the declarative JSX pattern.

The solution: a Bun plugin that library authors add to their existing `bunup.config.ts`. No new CLI command — bunup already handles entry discovery, externals, `.d.ts` generation, code splitting, and sourcemaps.

## What the plugin does

Runs two transforms on `.tsx` files during bunup build:

1. **Hydration transform** (before compile) — adds `data-v-id="ComponentName"` to root JSX elements of interactive components. Required because pre-compiled library output won't be re-processed by the app's compiler, so hydration markers must be baked in.

2. **Compile transform** — `let` → `signal()`, `const` → `computed()`, JSX → `__element()`/`__child()`, mutations → `peek()`/`notify()`. Adds runtime imports from `@vertz/ui` and `@vertz/ui/internals`.

CSS extraction is intentionally **skipped** — CSS hashing is path-dependent and must be done by the consuming app's build pipeline.

## Technical decisions from adversarial review

- **`loader: 'tsx'`** (not `'js'`) — `compile()` does NOT strip TypeScript annotations (interfaces, type params, `as` casts). `loader: 'js'` would cause Bun parse errors.
- **Source map chaining** — hydration map → compile map via `@ampproject/remapping`, then inlined as base64. Bun.build() chains with its own map if sourcemaps are enabled.
- **No-component files pass through** — `compile()` returns source unchanged when ComponentAnalyzer finds zero components (`compiler.ts:49-55`). HydrationTransformer also skips files with no components.

---

## Step 1: Create the library plugin

**Create** `packages/ui-compiler/src/library-plugin.ts`

```
createVertzLibraryPlugin(options?) → BunPlugin
```

Options: `{ filter?: RegExp, target?: 'dom' | 'tui' }`

Pipeline per file:
1. Read source
2. Parse with ts-morph (JSX=Preserve) for hydration transform
3. Run HydrationTransformer on MagicString
4. Run `compile()` on hydrated source
5. Chain source maps (hydration → compile) via `@ampproject/remapping`
6. Return `{ contents: code + inlineSourceMap, loader: 'tsx' }`

Error handling: throw on error-severity diagnostics, warn on warnings.

Reference: `packages/ui-server/src/bun-plugin/plugin.ts` lines 58-168 (steps 1-4 are the same pattern, minus CSS/HMR/FastRefresh).

## Step 2: Export from ui-compiler

**Modify** `packages/ui-compiler/src/index.ts` — add:
```ts
export { createVertzLibraryPlugin } from './library-plugin';
export type { VertzLibraryPluginOptions } from './library-plugin';
```

## Step 3: Tests

**Create** `packages/ui-compiler/src/__tests__/library-plugin.test.ts`

Test cases:
- Plugin returns object with `name` and `setup`
- Compiles `.tsx` with JSX → output contains `__element()` calls, no raw JSX
- Compiles `.tsx` with `let` signal → output contains `signal()`
- Adds hydration markers to interactive components (`data-v-id`)
- No-component files return source unchanged
- TypeScript annotations preserved in output (interfaces, types)
- Error diagnostics cause thrown error
- Source map is inlined as base64 comment
- `@vertz/ui` and `@vertz/ui/internals` imports are added

---

## Files changed

| Action | File |
|--------|------|
| Create | `packages/ui-compiler/src/library-plugin.ts` |
| Create | `packages/ui-compiler/src/__tests__/library-plugin.test.ts` |
| Modify | `packages/ui-compiler/src/index.ts` |

## Key files to reuse

- `packages/ui-compiler/src/compiler.ts` — `compile()` function
- `packages/ui-compiler/src/transformers/hydration-transformer.ts` — `HydrationTransformer`
- `packages/ui-server/src/bun-plugin/plugin.ts` — reference for hydration + compile + source map chaining pattern
- `@ampproject/remapping` — already a dependency of `@vertz/ui-compiler`

## Usage (how library authors wire it up)

```ts
// bunup.config.ts
import { defineConfig } from 'bunup';
import { createVertzLibraryPlugin } from '@vertz/ui-compiler';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  plugins: [createVertzLibraryPlugin()],
});
```

bunup handles everything else: entry resolution, externals, `.d.ts`, code splitting, sourcemaps.

## Verification

1. `cd packages/ui-compiler && bun test` — run all ui-compiler tests
2. Manual: write a small `.tsx` file with `let count = 0` + JSX, verify plugin output contains `signal()`, `__element()`, and `data-v-id`
