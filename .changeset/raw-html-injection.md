---
'@vertz/ui': patch
'@vertz/ui-server': patch
'@vertz/ui-auth': patch
---

feat(ui): add `innerHTML` JSX prop for raw HTML injection

Vertz now supports rendering raw HTML via an `innerHTML` prop on any HTML
host element — the equivalent of React's `dangerouslySetInnerHTML`, but
spelled as a single plain prop:

```tsx
<div innerHTML={trustedMarkup} />
```

The value is inserted verbatim. Callers are responsible for trust and
sanitization; a `trusted()` helper exports from `@vertz/ui` for marking
already-sanitized values. The compiler rejects the React spelling
(`dangerouslySetInnerHTML`) with a clear error (E0762), blocks pairing
with children (E0763), and forbids the prop on void and SVG elements
(E0764). The prop is reactive — bound signals update the element in
place — and safe across SSR + hydration (server content is preserved
until after hydration completes).

Closes #2761.
