---
'@vertz/ui': patch
'@vertz/ui-auth': patch
---

fix(ui): components returning Node or Signal can now be used as JSX

Narrowed Outlet return type to HTMLElement. Tightened Suspense and ErrorBoundary
prop/return types from Node to JSX.Element.
Refactored ProtectedRoute, AuthGate, AccessGate, UserName, and UserAvatar (in
@vertz/ui-auth) from returning computed signals to using __child() container
pattern (returns HTMLElement).
