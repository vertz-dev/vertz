---
'@vertz/ui': patch
'@vertz/theme-shadcn': patch
'@vertz/ui-auth': patch
'@vertz/native-compiler': patch
---

refactor(ui): drop shorthand-string CSS API in favour of object-form `css()` +
`token.*`

The array-form `css()` API is gone. `css()` and `variants()` now accept only
object-form `StyleBlock` trees:

```tsx
// Before
css({ card: ['bg:background', 'p:4', 'rounded:lg'] });

// After
css({
  card: {
    backgroundColor: token.color.background,
    padding: token.spacing[4],
    borderRadius: token.radius.lg,
  },
});
```

Removed from the public API: `StyleEntry`, `StyleValue`, `UtilityClass`, `s`,
`parseShorthand`, `resolveToken`, `ShorthandParseError`, `TokenResolveError`,
`InlineStyleError`, `isKnownProperty`, `isValidColorToken`, and all
token-table helpers.

The Rust compiler (`@vertz/native-compiler`) is smaller: the array-form
shorthand parser, the 1,900-line token tables, and the diagnostic pass that
validated shorthand strings have all been deleted. Only object-form extraction
remains.

Closes #1988.
