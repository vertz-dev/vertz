---
'@vertz/create-vertz-app': patch
'@vertz/ui': patch
'@vertz/ui-server': patch
---

fix(create-vertz-app): add DialogStackProvider to todo-app template

The todo-app template's `app.tsx` was missing `DialogStackProvider`, causing a runtime crash when the `TaskItem` component called `useDialogStack()` for delete confirmation.

fix(ui): fix DialogStackProvider hydration — children silently dropped

`DialogStackProvider` used `DocumentFragment` + `__insert` which no-ops Node values during hydration. Restructured to use `__enterChildren`/`__exitChildren`/`__append` pattern (matching `ThemeProvider`) so children are properly claimed from SSR DOM.

fix(runtime): return 200 for routerless apps instead of 404

Changed `matched_route_patterns` from `Vec<String>` to `Option<Vec<String>>` — `None` means no router (200), `Some(empty)` means router matched nothing (404).

fix(runtime): wait for API isolate init instead of returning 503

The API handler now calls `wait_for_init()` instead of returning 503 immediately when the isolate hasn't finished initializing, preventing race conditions on first request.
