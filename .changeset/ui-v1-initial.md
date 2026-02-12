---
'@vertz/ui': patch
'@vertz/ui-compiler': patch
'@vertz/ui-server': patch
'@vertz/primitives': patch
---

Initial release of @vertz/ui — a compiler-driven reactive UI framework.

- Reactivity: `signal()`, `computed()`, `effect()`, `batch()`, `untrack()`
- Compiler: `let` → signal, `const` derived → computed, JSX → DOM helpers, mutation → peek/notify
- Component model: `ref()`, `onMount()`, `onCleanup()`, `watch()`, `children()`, `createContext()`
- Error handling: `ErrorBoundary`, `Suspense` with async support
- CSS-in-JS: `css()` with type-safe properties, `variants()`, `globalCss()`, `s()` shorthand
- Theming: `defineTheme()`, `ThemeProvider`, CSS variable generation
- Zero-runtime CSS extraction via compiler plugin
- Forms: `form()` with schema validation, `formDataToObject()`, SDK method integration
- Data fetching: `query()` with caching, `MemoryCache`, key derivation
- SSR: `renderToStream()`, `serializeToHtml()`, `HeadCollector` for streaming HTML
- Hydration: `hydrate()` with eager/lazy/interaction strategies, component registry
- Router: `defineRoutes()`, `createRouter()`, `createLink()`, `createOutlet()`, search params
- Primitives: 15 headless components (Button, Dialog, Select, Menu, Tabs, Accordion, etc.)
- Testing: `renderTest()`, `findByText()`, `click()`, `type()`, `press()`, `createTestRouter()`
- Vite plugin: HMR, CSS extraction, codegen watch mode
- Curated public API: developer-facing exports in main barrel, compiler internals in `@vertz/ui/internals`
