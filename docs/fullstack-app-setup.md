# Full-Stack App Configuration

The Vertz compiler transforms your JSX at dev time — auto-unwrapping signals, making `let`/`const` reactive, rewriting `__list`/`__cond`, and enabling Fast Refresh. Without the config below, none of this happens and your app renders raw signal objects.

## Required Files

Every `@vertz/ui` full-stack app needs these 4 files. Copy them from `examples/task-manager/` or use the snippets below.

### 1. `bunfig.toml`

Registers the Vertz compiler plugin with Bun's dev server.

```toml
[serve.static]
plugins = ["./bun-plugin-shim.ts"]
```

> If you use `[test]` preloads, add them in the same file — see `examples/task-manager/bunfig.toml` for the full version.

### 2. `bun-plugin-shim.ts`

Thin wrapper that bridges `createVertzBunPlugin()` (named export) to the default-export format `bunfig.toml` expects.

```ts
/**
 * Thin shim that wraps @vertz/ui-server/bun-plugin for bunfig.toml consumption.
 *
 * bunfig.toml `[serve.static] plugins` requires a default export of type BunPlugin.
 * The @vertz/ui-server/bun-plugin package exports a factory function (createVertzBunPlugin)
 * as a named export — this shim bridges the two.
 */
import { createVertzBunPlugin } from '@vertz/ui-server/bun-plugin';

const { plugin } = createVertzBunPlugin();

export default plugin;
```

### 3. `index.html`

The Fast Refresh runtime **must** load before your app entry so `globalThis.__$refreshReg` and friends are available when components register.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My App</title>
  </head>
  <body>
    <div id="app"></div>
    <!-- Fast Refresh runtime MUST load before app to populate globalThis -->
    <script type="module" src="./node_modules/@vertz/ui-server/dist/bun-plugin/fast-refresh-runtime.js"></script>
    <script type="module" src="./src/entry-client.ts"></script>
  </body>
</html>
```

### 4. `src/entry-client.ts`

Must include `import.meta.hot.accept()` so Bun performs component-level HMR instead of full page reloads.

```ts
import { mount } from '@vertz/ui';
import { App } from './app';

// Prevents full page reloads — component-level Fast Refresh handles actual changes.
import.meta.hot.accept();

mount(App, '#app');
```

> Pass `theme` and `styles` options to `mount()` as needed — see `examples/task-manager/src/entry-client.ts`.

## What Breaks Without Each File

| Missing file | Symptom |
|---|---|
| `bunfig.toml` + `bun-plugin-shim.ts` | No compiler transforms. Signals render as `[object Object]`, reactive UI is static. |
| Fast Refresh `<script>` in `index.html` | `TypeError: Cannot destructure property '__$refreshReg'` on load. |
| `import.meta.hot.accept()` in entry | Full page reloads on every file change instead of component-level HMR. |

## Setup Checklist

- [ ] `bunfig.toml` exists at project root with `[serve.static] plugins`
- [ ] `bun-plugin-shim.ts` exists at project root and default-exports the plugin
- [ ] `index.html` loads Fast Refresh runtime **before** the app entry script
- [ ] `src/entry-client.ts` calls `import.meta.hot.accept()`

## Reference

The canonical working example is [`examples/task-manager/`](../examples/task-manager/).
