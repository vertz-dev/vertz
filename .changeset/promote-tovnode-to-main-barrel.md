---
'@vertz/ui-server': patch
---

chore(ui-server): re-export `toVNode` from the main barrel

`toVNode` was previously only reachable via the `@vertz/ui-server/dom-shim`
subpath, which forced integration tests inside `ui-server` to reach into the
package via a relative `../dom-shim` import. It now ships alongside the other
SSR helpers (`renderToHTML`, `serializeToHtml`, `compile`, …) on the main
`@vertz/ui-server` entry, so tests and consumers can depend on the public
contract instead of the internal module layout.

Closes #2781.
