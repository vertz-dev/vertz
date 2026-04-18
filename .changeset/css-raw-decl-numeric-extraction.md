---
'@vertz/ui': patch
'@vertz/native-compiler': patch
---

fix(ui,compiler): emit numeric/boolean raw CSS declarations from `css()` and `variants()`

Raw object declarations inside nested selectors used to silently drop
non-string values. Numeric values now flow through the same kebab-case +
unitless/`px` rules as shorthand tokens, in both the runtime and the AOT
compiler.

```ts
css({
  card: [
    {
      '&:hover': {
        fontSize: 16,        // → font-size: 16px
        opacity: 0.8,        // → opacity: 0.8 (unitless)
        marginTop: -8,       // → margin-top: -8px
        '--my-tone': 1,      // → --my-tone: 1 (custom prop, no unit)
        padding: 0,          // → padding: 0 (zero is unitless)
      },
    },
  ],
});
```

`UnaryExpression(-, NumericLiteral)` and `BooleanLiteral` are also accepted.
The unitless property list is shared between `packages/ui/src/css/unitless-properties.ts`
and `native/vertz-compiler-core/src/css_unitless.rs`, with a parity test
already enforcing they stay in sync.

Closes #2783.
