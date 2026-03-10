---
'@vertz/ui-server': patch
---

Add incremental HMR manifest updates — regenerate changed file's reactivity manifest on save before SSR re-import, with change detection to skip unnecessary cache invalidation
