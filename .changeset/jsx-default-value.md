---
'@vertz/native-compiler': patch
'@vertz/ui': patch
'vtz': patch
---

fix(jsx): honor `defaultValue` / `defaultChecked` on `<input>` and `<textarea>`

The React-style uncontrolled-initial-value props were silently dropped:

```tsx
<textarea defaultValue="Hello world" />  // rendered empty
<input defaultValue="initial" />          // rendered empty
<input type="checkbox" defaultChecked /> // rendered unchecked
```

Both have no HTML content attribute, so the compiler's fallback to
`setAttribute("defaultValue", ...)` was a no-op in the browser.

The native compiler and the test-time JSX runtime now route these through
the IDL property path (`el.defaultValue = "..."`, `el.defaultChecked = true`),
matching how `value` / `checked` are already handled. The SSR DOM shim
serializes them to the correct initial HTML — `value="..."` for `<input>`,
text content for `<textarea>`, and the `checked` attribute for
`<input type="checkbox">` — so the value is visible before hydration.

Closes #2820.
