# Phase 1: `injectHtmlAttributes` Utility

## Context

SSR HTML attributes injection ([#2186](https://github.com/vertz-dev/vertz/issues/2186)). This phase implements the core utility function that parses, merges, and reconstructs the `<html>` tag with injected attributes. See `plans/ssr-html-attributes.md` for full design.

## Tasks

### Task 1: `injectHtmlAttributes` + `parseHtmlTagAttrs` with TDD

**Files:**
- `packages/ui-server/src/template-inject.ts` (modified — add exported function)
- `packages/ui-server/src/__tests__/template-inject.test.ts` (modified — add tests)

**What to implement:**

Add two functions to `template-inject.ts`:

1. `parseHtmlTagAttrs(attrStr: string): Record<string, string>` — parse attribute string from `<html ...>` tag into a key-value record. Handles `key="value"`, `key='value'`, bare `key` (boolean attributes).

2. `injectHtmlAttributes(template: string, attrs: Record<string, string>): string` — the main utility:
   - Validate keys against `/^[a-zA-Z][a-zA-Z0-9\-]*$/`, throw on invalid
   - Match `<html ...>` tag (case-insensitive)
   - Parse existing attributes
   - Merge with callback attrs (callback wins on conflict)
   - Escape values via `escapeAttr()`
   - Reconstruct the tag
   - Return unchanged template if no `<html` found or empty attrs

**Acceptance criteria:**
- [ ] Empty attrs record returns template unchanged
- [ ] Single attribute is injected: `<html lang="en">` + `{ 'data-theme': 'dark' }` → `<html lang="en" data-theme="dark">`
- [ ] Multiple attributes injected in one call
- [ ] Callback overrides existing template attribute: `<html lang="en">` + `{ lang: 'pt-BR' }` → `<html lang="pt-BR">`
- [ ] Mixed: some override, some new attributes
- [ ] Values are HTML-escaped (e.g., `"` → `&quot;`)
- [ ] Invalid key throws: `{ 'on load="alert(1)" x': 'y' }` → Error
- [ ] Empty key throws
- [ ] Template without `<html` tag returns unchanged
- [ ] Case-insensitive: `<HTML lang="en">` works
- [ ] `<html>` with no existing attrs works
- [ ] `<html\n  lang="en">` (multiline) works
- [ ] Boolean attributes in template preserved: `<html lang="en" hidden>`
