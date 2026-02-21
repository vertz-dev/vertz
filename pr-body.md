## Summary

Implements `renderToHTML(App, options)` wrapping existing `renderPage()` with a simpler, config-driven API.

Closes #508

### API
```tsx
const html = await renderToHTML(App, {
  url: req.url,
  theme: todoTheme,
  styles: [globalStyles.css],
  head: { title: 'My App' },
})
```

### Features
- Theme auto-compilation via compileTheme()
- Global styles injection in <head>
- Head config (title, meta, links)
- DOM shim management (__SSR_URL__ set/cleanup)
- Returns Promise<string>

### Tests
- 7 tests covering all options
- No regressions

Phase 2 of mount() API.
