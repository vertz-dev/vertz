---
'@vertz/ui-server': patch
'@vertz/cli': patch
---

fix(ui-server): AOT SSR pipeline composes App layout shell around page content

The AOT pipeline now wraps page content in the root App layout (header, nav, footer) instead of rendering bare page HTML. The build pipeline detects the App component by its RouterView hole, includes it in the AOT manifest, and the runtime pipeline renders the App shell around each page. Gracefully degrades if app render fails.
