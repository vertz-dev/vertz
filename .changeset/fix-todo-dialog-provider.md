---
'@vertz/create-vertz-app': patch
'@vertz/ui': patch
'@vertz/ui-server': patch
'@vertz/theme-shadcn': patch
---

fix(create-vertz-app): add DialogStackProvider to todo-app template

The todo-app template's `app.tsx` was missing `DialogStackProvider`, causing a runtime crash when the `TaskItem` component called `useDialogStack()` for delete confirmation. Also added `w:full` to task item styles so items stretch within `List.Item` flex containers.

fix(ui): fix DialogStackProvider hydration — children silently dropped

`DialogStackProvider` used `DocumentFragment` + `__insert` which no-ops Node values during hydration. Restructured to use `__enterChildren`/`__exitChildren`/`__append` pattern (matching `ThemeProvider`) with `display:contents` so children are properly claimed from SSR DOM without affecting layout.

fix(theme-shadcn): fix dialog centering killed by global CSS reset

The `* { margin: 0 }` global reset was overriding the native `<dialog>` `margin: auto` needed for `showModal()` centering. Added `margin: auto` to the dialog wrapper and fixed the panel width to use explicit sizing instead of circular `width: 100%` dependency.

fix(runtime): return 200 for routerless apps instead of 404

Changed `matched_route_patterns` from `Vec<String>` to `Option<Vec<String>>` — `None` means no router (200), `Some(empty)` means router matched nothing (404).

fix(runtime): wait for API isolate init instead of returning 503

The API handler now calls `wait_for_init()` instead of returning 503 immediately when the isolate hasn't finished initializing, preventing race conditions on first request.
