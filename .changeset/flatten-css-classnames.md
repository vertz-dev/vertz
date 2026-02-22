---
'@vertz/ui': patch
---

Simplify css() return type — class names are now top-level properties instead of
nested under .classNames.

Before: `styles.classNames.card`
After: `styles.card`

The `css` property remains accessible as a non-enumerable property, so
Object.keys() and Object.entries() only yield block names.

A block named 'css' is now a compile-time and runtime error (reserved name).

This also fixes a latent compiler bug where css-transformer produced flat
objects but .classNames access sites were never rewritten.
