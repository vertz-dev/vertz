---
'@vertz/cli': patch
'@vertz/ui-server': patch
---

Remove index.html from the framework

UI apps no longer require an `index.html` file in the project root. The production build now generates the HTML shell programmatically with the correct asset references, eliminating the need for:
- Manual `index.html` maintenance
- Fast Refresh runtime stripping during build
- Dev script tag replacement with hashed entries
- `./public/` path rewriting

The `createIndexHtmlStasher` dev server mechanism (which renamed `index.html` during development to prevent Bun from auto-serving it) has been removed entirely.

`UIBuildConfig` gains an optional `title` field (default: `'Vertz App'`) to set the HTML page title.
