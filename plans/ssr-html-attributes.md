# SSR HTML Attributes Injection

**Issue:** [#2186](https://github.com/vertz-dev/vertz/issues/2186)
**Status:** Design (Rev 2 — addressed DX, Product, Technical reviews)

## Problem

`createSSRHandler` renders content inside `<div id="app">`, but the `<html>` tag comes from the static template and is never modified per-request. Any attributes that need to be on `<html>` (like `data-theme`) must be hacked in by the Worker/server after SSR completes.

The current workaround in component-docs:

```ts
let html = await response.text();
html = html.replace('<html lang="en">', `<html lang="en" data-theme="${theme}">`);
```

This defeats streaming (must buffer entire response), duplicates cookie parsing, and forces every themed app to implement the same hack.

The dev server already supports this via `generateSSRPageHtml({ htmlDataTheme })`, which generates the `<html>` tag dynamically. Production needs parity.

## API Surface

### Option: `htmlAttributes` callback

```ts
import { createSSRHandler } from '@vertz/ui-server';

const handler = createSSRHandler({
  module: ssrModule,
  template,
  htmlAttributes: (request) => ({
    'data-theme': getThemeCookie(request) ?? 'dark',
    'data-color-mode': 'system',
  }),
});
```

The callback receives the raw `Request` and returns a `Record<string, string>` of attributes to set on the `<html>` tag. If the template already has an attribute with the same name, the callback's value **overrides** it. Returning `{}`, `null`, or `undefined` leaves the tag unchanged.

### Type signature

```ts
export interface SSRHandlerOptions {
  // ... existing options ...

  /**
   * Derive attributes to set on the `<html>` tag from the incoming request.
   *
   * Useful for setting `data-theme`, `dir`, `lang`, or other attributes that
   * must be on `<html>` to avoid FOUC. The callback runs before SSR rendering
   * so the attributes are available in the first byte of the response.
   *
   * If the template already has an attribute with the same name, the callback's
   * value overrides it. Values are HTML-escaped automatically. Keys must be
   * valid HTML attribute names (`/^[a-zA-Z][a-zA-Z0-9\-]*$/`).
   *
   * Return `undefined`, `null`, or `{}` to skip injection.
   *
   * @example
   * ```ts
   * htmlAttributes: (request) => ({
   *   'data-theme': getThemeCookie(request) ?? 'dark',
   *   dir: getDirection(request),
   * })
   * ```
   */
  htmlAttributes?: (request: Request) => Record<string, string> | null | undefined;
}
```

### Template injection — merge semantics

The implementation **parses** existing attributes from the `<html>` tag, **merges** with the callback's result (callback wins on conflicts), and **reconstructs** the tag. This prevents duplicate attributes and ensures the callback can override template defaults like `lang`.

```ts
// Template: <html lang="en" class="no-js">
// Callback returns: { lang: 'pt-BR', 'data-theme': 'dark' }
// Result:  <html lang="pt-BR" class="no-js" data-theme="dark">
```

### Attribute key validation

Keys are validated against `/^[a-zA-Z][a-zA-Z0-9\-]*$/`. Invalid keys throw an error at request time with a clear message. This prevents attribute key injection attacks (e.g., `'onload="alert(1)" x'` as a key).

### Attribute value escaping

All attribute values are escaped via `escapeAttr()` from `html-serializer.ts` (escapes `&` and `"`). Since values are always placed inside double quotes, this is sufficient to prevent XSS — the `"` escape prevents attribute breakout, and `&` prevents entity injection.

### Dev server parity

The dev server's `BunDevServerOptions` already has `themeFromRequest`. This feature adds `htmlAttributes` to `BunDevServerOptions` with the same signature as the production handler. `themeFromRequest` is kept as a convenience shorthand — when set, it maps to `{ 'data-theme': value }` internally. If both `themeFromRequest` and `htmlAttributes` are set, `themeFromRequest`'s value is merged into `htmlAttributes`'s result (explicit `htmlAttributes` wins on `data-theme`).

`themeFromRequest` is not deprecated — it's the common case and saves boilerplate. `htmlAttributes` is for when you need more than just theme.

### Scope: both handlers

Both `createSSRHandler` (web `Request`/`Response`) and `createNodeHandler` (Node `IncomingMessage`/`ServerResponse`) share `SSRHandlerOptions`, so both get `htmlAttributes`. The Node handler already constructs a `Request` object for `sessionResolver` — the same pattern is reused for `htmlAttributes`.

### Nav requests excluded

`htmlAttributes` is **not** invoked for nav pre-fetch requests (`X-Vertz-Nav: 1`). Nav requests return SSE streams, not HTML — there is no `<html>` tag to modify. Both handlers branch early for nav requests before reaching the html attributes logic.

### Rust runtime

The Rust runtime (`native/vtz/`) uses `createSSRHandler` from JS via the persistent isolate. It gets `htmlAttributes` support for free — no separate Rust-side work needed.

## Implementation Approach

### Where injection happens

A new utility function `injectHtmlAttributes(template, attrs)` in `template-inject.ts`:

```ts
const VALID_ATTR_KEY = /^[a-zA-Z][a-zA-Z0-9\-]*$/;

export function injectHtmlAttributes(
  template: string,
  attrs: Record<string, string>,
): string {
  const entries = Object.entries(attrs);
  if (entries.length === 0) return template;

  // Validate keys
  for (const [key] of entries) {
    if (!VALID_ATTR_KEY.test(key)) {
      throw new Error(`Invalid HTML attribute key: "${key}"`);
    }
  }

  // Match the <html ...> tag (case-insensitive)
  const htmlTagMatch = template.match(/<html(\s[^>]*)?>|<html>/i);
  if (!htmlTagMatch || htmlTagMatch.index == null) return template;

  // Parse existing attributes from the tag
  const existingAttrsStr = htmlTagMatch[1] ?? '';
  const existingAttrs = parseHtmlTagAttrs(existingAttrsStr);

  // Merge: callback values override existing
  const merged = { ...existingAttrs };
  for (const [key, value] of entries) {
    merged[key] = escapeAttr(value);
  }

  // Reconstruct the tag
  const attrStr = Object.entries(merged)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');

  const tagEnd = htmlTagMatch.index + htmlTagMatch[0].length;
  return template.slice(0, htmlTagMatch.index) + `<html${attrStr}>` + template.slice(tagEnd);
}

/** Parse attributes from an HTML tag's attribute string. Returns unescaped values. */
function parseHtmlTagAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z][a-zA-Z0-9\-]*)(?:\s*=\s*"([^"]*)")?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]!] = m[2] ?? '';
  }
  return attrs;
}
```

### Buffered path (handleHTMLRequest)

The callback is invoked per-request, before `injectIntoTemplate()`:

```ts
let templateForRequest = template;
if (htmlAttributes) {
  const attrs = htmlAttributes(request);
  if (attrs && Object.keys(attrs).length > 0) {
    templateForRequest = injectHtmlAttributes(template, attrs);
  }
}

const html = injectIntoTemplate({
  template: templateForRequest,
  appHtml: result.html,
  // ...
});
```

### Progressive streaming path (handleProgressiveHTMLRequest)

The `splitResult.headTemplate` is modified per-request before building the head chunk:

```ts
let headChunk = split.headTemplate;
if (htmlAttributes) {
  const attrs = htmlAttributes(request);
  if (attrs && Object.keys(attrs).length > 0) {
    headChunk = injectHtmlAttributes(headChunk, attrs);
  }
}
```

Since `headTemplate` contains the `<html>` tag, this works without buffering — the modified head is sent as the first chunk. The tail (closing tags) is unaffected.

### AOT path

AOT rendering goes through `handleHTMLRequest`, so it gets the same treatment automatically.

### Node handler

The node handler constructs a `Request` from `IncomingMessage` (same pattern as `sessionResolver`) and passes it to `htmlAttributes`:

```ts
if (htmlAttributes) {
  const fullUrl = `http://${req.headers.host ?? 'localhost'}${url}`;
  const webRequest = new Request(fullUrl, {
    method: req.method ?? 'GET',
    headers: req.headers as Record<string, string>,
  });
  const attrs = htmlAttributes(webRequest);
  if (attrs && Object.keys(attrs).length > 0) {
    templateForRequest = injectHtmlAttributes(template, attrs);
  }
}
```

Note: if `sessionResolver` is also set, the `Request` object construction can be shared between both callbacks to avoid creating it twice.

## Manifesto Alignment

### One way to do things (Principle 2)

There's currently no way to set `<html>` attributes in production SSR. This adds the one way. The callback pattern is consistent with `sessionResolver` — another per-request hook on `SSRHandlerOptions`.

### AI agents are first-class users (Principle 3)

`htmlAttributes: (request) => ({ 'data-theme': ... })` is a straightforward callback. An LLM can produce correct usage on the first prompt without ambiguity. The merge semantics (callback wins) match what developers expect — no silent duplicate attribute gotcha.

### Performance is not optional (Principle 7)

The implementation preserves streaming. The regex match on `<html` terminates almost immediately (position ~15 in the template). Attribute parsing is lightweight — a typical `<html>` tag has 1-2 attributes. No buffering, no DOM parsing, no template re-splitting.

### Rejected alternatives

- **Template placeholder (`<html {{htmlAttrs}}>`)**: Requires a new template syntax, adds parsing complexity, and templates are build artifacts (users don't author them). The regex approach works on any valid HTML template.
- **Post-render string replacement**: The current workaround. Defeats streaming, forces buffering.
- **Pre-split template per-request**: Re-splitting the template on every request is wasteful. Modifying `headTemplate` in place is simpler and faster.
- **Append-only (no merge)**: Would produce duplicate HTML attributes when callback keys overlap with template keys. Browsers use the first attribute occurrence, silently ignoring the callback's value. Merge-and-override eliminates this entire class of bugs.

## Non-Goals

- **Dynamic `<body>` or `<head>` tag attributes** — only `<html>` is in scope. `<head>` content injection already works via `headTags`. `<body>` attributes are not a known use case.
- **Async htmlAttributes callback** — the callback is sync. Theme/lang resolution from cookies is synchronous. If async is needed later, it can be added as a separate option.
- **Deprecating `themeFromRequest`** — it's kept as convenience sugar. `htmlAttributes` is the general-purpose escape hatch. Both coexist cleanly.

## Unknowns

None identified. The duplicate attribute concern from Rev 1 is resolved by the merge semantics.

## POC Results

No POC needed — the implementation is string parsing and replacement on `<html>`, already proven by the dev server's `generateSSRPageHtml`. Attribute parsing is a well-understood problem with a simple regex solution.

## Type Flow Map

No generics involved. The API is:

```
SSRHandlerOptions.htmlAttributes  →  (Request) => Record<string, string> | null | undefined
                                           ↓
                                     injectHtmlAttributes(template, attrs)
                                           ↓
                                     modified template string
```

All types are concrete — no generic parameters to trace.

## E2E Acceptance Test

### Developer walkthrough

```ts
import { createSSRHandler } from '@vertz/ui-server';

// Setup: handler with htmlAttributes callback
const handler = createSSRHandler({
  module: ssrModule,
  template: '<!doctype html><html lang="en"><head></head><body><div id="app"><!--ssr-outlet--></div></body></html>',
  htmlAttributes: (request) => {
    const theme = new URL(request.url).searchParams.get('theme') ?? 'light';
    return { 'data-theme': theme };
  },
});

// Test 1: attributes are injected
const response = await handler(new Request('http://localhost/?theme=dark'));
const html = await response.text();
expect(html).toContain('data-theme="dark"');
expect(html).toContain('lang="en"');

// Test 2: callback overrides existing template attributes
const langHandler = createSSRHandler({
  module: ssrModule,
  template: '<!doctype html><html lang="en"><head></head><body><div id="app"><!--ssr-outlet--></div></body></html>',
  htmlAttributes: () => ({ lang: 'pt-BR', 'data-theme': 'dark' }),
});
const langResponse = await langHandler(new Request('http://localhost/'));
const langHtml = await langResponse.text();
// Merged: callback's lang wins, only one lang attribute
expect(langHtml).toContain('lang="pt-BR"');
expect(langHtml).not.toContain('lang="en"');

// Test 3: XSS prevention — malicious value is escaped
const xssHandler = createSSRHandler({
  module: ssrModule,
  template: '<!doctype html><html lang="en"><head></head><body><div id="app"><!--ssr-outlet--></div></body></html>',
  htmlAttributes: () => ({ 'data-theme': '"><script>alert(1)</script>' }),
});
const xssResponse = await xssHandler(new Request('http://localhost/'));
const xssHtml = await xssResponse.text();
// escapeAttr escapes & and " — the " breakout is prevented
expect(xssHtml).toContain('data-theme="&quot;>');
expect(xssHtml).not.toContain('data-theme="">');

// Test 4: invalid key throws
const badKeyHandler = createSSRHandler({
  module: ssrModule,
  template: '<!doctype html><html lang="en"><head></head><body><div id="app"><!--ssr-outlet--></div></body></html>',
  htmlAttributes: () => ({ 'on load="alert(1)" x': 'y' }),
});
await expect(badKeyHandler(new Request('http://localhost/'))).rejects.toThrow('Invalid HTML attribute key');

// Test 5: no attributes — template unchanged
const noAttrsHandler = createSSRHandler({
  module: ssrModule,
  template: '<!doctype html><html lang="en"><head></head><body><div id="app"><!--ssr-outlet--></div></body></html>',
  htmlAttributes: () => ({}),
});
const noAttrsResponse = await noAttrsHandler(new Request('http://localhost/'));
const noAttrsHtml = await noAttrsResponse.text();
expect(noAttrsHtml).toContain('<html lang="en">');

// Test 6: null/undefined return — template unchanged
const nullHandler = createSSRHandler({
  module: ssrModule,
  template: '<!doctype html><html lang="en"><head></head><body><div id="app"><!--ssr-outlet--></div></body></html>',
  htmlAttributes: () => null,
});
const nullResponse = await nullHandler(new Request('http://localhost/'));
const nullHtml = await nullResponse.text();
expect(nullHtml).toContain('<html lang="en">');

// Test 7: works with undefined return type
const undefinedReturn: () => Record<string, string> | undefined = () => undefined;
createSSRHandler({
  module: ssrModule,
  template: '',
  htmlAttributes: undefinedReturn,
}); // compiles cleanly

// @ts-expect-error — htmlAttributes must return Record<string, string>, not number values
createSSRHandler({
  module: ssrModule,
  template: '',
  htmlAttributes: () => ({ 'data-theme': 123 }),
});
```

## Affected Files

| File | Change |
|------|--------|
| `packages/ui-server/src/ssr-handler.ts` | Add `htmlAttributes` to `SSRHandlerOptions`, pass `request` + callback to both request paths |
| `packages/ui-server/src/node-handler.ts` | Destructure `htmlAttributes`, construct `Request` for callback, inject in both paths |
| `packages/ui-server/src/template-inject.ts` | Add `injectHtmlAttributes()` + `parseHtmlTagAttrs()` utilities |
| `packages/ui-server/src/__tests__/template-inject.test.ts` | Unit tests for `injectHtmlAttributes()` (merge, escape, key validation, edge cases) |
| `packages/ui-server/src/__tests__/ssr-handler.test.ts` | Integration tests for the full handler with `htmlAttributes` |

## Review Findings Addressed (Rev 2)

| # | Source | Finding | Resolution |
|---|--------|---------|------------|
| 1 | DX, Product, Technical | Duplicate attributes are a footgun | Changed to merge semantics — callback overrides template attributes |
| 2 | DX, Technical | Attribute key injection / no sanitization | Added key validation regex, throws on invalid keys |
| 3 | Technical | `escapeAttr()` E2E assertion mismatch | Fixed E2E test to match actual `escapeAttr()` behavior (escapes `&` and `"` only) |
| 4 | Product, Technical | `node-handler.ts` not in affected files | Added to affected files, described `Request` construction pattern |
| 5 | DX, Product | Dev server parity vague on `themeFromRequest` | Clarified: both coexist, `themeFromRequest` is convenience sugar, not deprecated |
| 6 | Technical | Regex case-insensitive | Changed to `/i` flag in implementation |
| 7 | Technical | Nav requests should be excluded | Documented: `htmlAttributes` not invoked for nav (SSE) requests |
| 8 | Technical | Incorrect HTML spec citation | Removed — moot now that merge semantics replace append-only |
| 9 | DX | JSDoc needs `@example` | Added inline example in JSDoc |
| 10 | DX | Accept `null` return | Changed return type to `Record<string, string> \| null \| undefined` |
| 11 | Product | Positive type test for `undefined` return | Added Test 7 in acceptance tests |
| 12 | Product | Rust runtime clarification | Added section: Rust runtime uses `createSSRHandler` from JS, gets it for free |
