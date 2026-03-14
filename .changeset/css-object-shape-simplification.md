---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
'@vertz/theme-shadcn': patch
---

Simplify css() nested selector object shape from `{ property: 'x', value: 'y' }` to plain `{ 'x': 'y' }`. Remove RawDeclaration type. Support both direct object and array-with-objects forms for nested selectors.
