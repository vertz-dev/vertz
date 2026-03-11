---
'@vertz/ui': patch
'@vertz/ui-server': patch
---

Add unified route access rules using `rules.*` descriptors. Routes can declare `access: rules.authenticated()` (or `role`, `entitlement`, `fva`, `all`, `any`) to restrict navigation. SSR handler enforces access as a security boundary (redirects on denial). Client-side router checks access advisorily before navigation and on popstate. Parent access rules cascade to child routes.
