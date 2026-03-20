---
'@vertz/ui-compiler': patch
'@vertz/ui': patch
'@vertz/theme-shadcn': patch
---

fix(ui-compiler): support JSX spread attributes on intrinsic elements and components

JSX spread attributes (`<button {...rest}>`, `<Button {...props}>`) were silently dropped by the compiler. Spread attributes now work correctly:

- **Component calls**: spread emits `...expr` in the props object literal
- **Intrinsic elements**: spread emits `__spread(el, props)` runtime call that handles event handlers, style, class/className, ref, SVG attributes, and standard HTML attributes
- **theme-shadcn Button**: removed `applyProps` workaround in favor of native JSX spread
