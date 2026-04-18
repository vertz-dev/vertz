---
'@vertz/native-compiler': patch
---

fix(compiler): route `innerHTML` through AOT content, not as an HTML attribute

When a JSX element with an `innerHTML` prop was compiled through the AOT SSR
path (for example a `<BrandedIcon>` sub-component), the attribute was being
serialized as the HTML attribute `innerHTML="..."` rather than written into
the element's content slot. The DOM path (via `__html()`) already handled it
correctly; the AOT path missed it because `innerHTML` was not in the skip
list and had no extraction helper.

The AOT transformer now mirrors `dangerouslySetInnerHTML`: it skips
`innerHTML` during attribute serialization and uses the expression as the
element's content.

Closes #2790.
