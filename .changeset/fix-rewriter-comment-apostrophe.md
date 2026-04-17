---
'@vertz/runtime': patch
---

fix(vtz): import rewriter now skips JS comments

The `/@deps/` import rewriter did not recognize `//` or `/* */` comments,
so an apostrophe inside a comment (e.g. `// indicator's data-state`)
opened a fake string literal that swallowed every `import` statement until
the next apostrophe. In `@vertz/theme-shadcn@0.2.70/dist/index.js` this
leaked 5 of 46 bare `@vertz/ui` imports to the browser despite #2740.
The rewriter and its `from` search now skip line and block comments.
Closes #2730.
