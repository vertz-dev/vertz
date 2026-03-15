---
'@vertz/theme-shadcn': patch
---

`Input` and `Textarea` now wire `on*` props (e.g. `onInput`, `onChange`, `onFocus`) as event listeners instead of setting them as string attributes. Also adds `onInput` and `onChange` to the shared `ElementEventHandlers` interface.
