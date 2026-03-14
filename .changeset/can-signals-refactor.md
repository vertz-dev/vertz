---
'@vertz/ui': patch
'@vertz/ui-auth': patch
---

refactor(ui): add canSignals() to avoid double-cast in ProtectedRoute

Extracted signal-creation logic from can() into shared createAccessCheckRaw() helper.
Added canSignals() that returns raw ReadonlySignal properties for framework code
that runs without compiler transforms. Updated createEntitlementGuard to use
canSignals() — eliminates the `as unknown as ReadonlySignal<boolean>` double-cast.
