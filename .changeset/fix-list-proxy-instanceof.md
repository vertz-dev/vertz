---
'@vertz/ui': patch
---

fix(ui): preserve prototype chain in `__list` item proxies (#1581)

`createItemProxy` used `{}` as the Proxy target, which broke `instanceof` checks
(e.g., `val instanceof Date`) and `Array.isArray()` for proxied list items.
Changed to use the initial item value as the target and added a `getPrototypeOf`
trap that reads from the live signal value. Also added a read-only `set` trap to
prevent accidental mutation of original items through the proxy.
