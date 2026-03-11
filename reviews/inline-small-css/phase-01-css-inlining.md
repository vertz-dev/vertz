# Phase 1: CSS Inlining in Build Script

- **Author:** viniciusdacal (agent)
- **Reviewer:** claude-opus (adversarial review)
- **Date:** 2026-03-11

## Changes

- `sites/landing/scripts/build-css-injection.ts` (new)
- `sites/landing/scripts/build-css-injection.test.ts` (new)
- `sites/landing/scripts/build.ts` (modified)

## CI Status

- [x] Tests pass (8/8)
- [x] Typecheck clean
- [x] Lint clean

## Review Checklist

- [x] Delivers what the ticket asks for (inline small CSS, link large CSS)
- [x] TDD compliance (tests before/alongside implementation)
- [x] Public API changes match design doc — function signature, threshold, `data-vertz-css` attribute all match
- [x] Integration correctness — `build.ts` correctly collects Bun CSS outputs via `output.text()` and extracted CSS, passes to `buildCssInjection`, writes only linked files, cleans up orphans
- [x] Orphaned file cleanup — logic is correct; compares absolute paths consistently
- [ ] No security issues — **one finding** (see F-01)
- [ ] Edge cases — **two missing tests** (see F-02, F-03)

## Findings

### Changes Requested

#### F-01 (Severity: Medium) — `</style>` in CSS content breaks HTML parsing

`build-css-injection.ts` line 31:
```ts
tags.push(`  <style data-vertz-css>${source.content}</style>`);
```

If `source.content` contains the literal string `</style>`, the browser will close the `<style>` element prematurely. Everything after `</style>` inside the CSS is then parsed as HTML, which is a correctness bug and a potential XSS vector.

While the current landing page CSS is unlikely to contain this string, the function is a general-purpose pure function that accepts arbitrary CSS content. The design doc explicitly calls it a "pure function" — it should handle all valid CSS input correctly.

**Fix:** Escape occurrences of `</style` (case-insensitive) within the CSS content before interpolation. The standard approach is to replace `</style` with `<\/style` inside the style tag content:

```ts
const escaped = source.content.replace(/<\/style/gi, '<\\/style');
tags.push(`  <style data-vertz-css>${escaped}</style>`);
```

Alternatively, since this is a build script (not runtime), you could assert/throw if the CSS contains `</style>` — but escaping is safer and more general.

**Add a test:**
```ts
it('Then escapes </style> sequences in CSS content', () => {
  const result = buildCssInjection([
    { content: 'div::after { content: "</style><script>alert(1)</script>"; }', href: '/a.css' },
  ]);
  expect(result.html).not.toContain('</style><script>');
  expect(result.html).toContain('<\\/style');
});
```

#### F-02 (Severity: Low) — Missing test for exactly-at-threshold boundary

The implementation uses `<=` on line 30:
```ts
if (source.content.length <= threshold) {
```

This means CSS of exactly `threshold` bytes is inlined. The tests cover under-threshold and over-threshold, but never the exact boundary. This is a classic off-by-one risk area.

**Fix:** Add a test:
```ts
describe('Given CSS content exactly at threshold', () => {
  it('Then inlines it (threshold is inclusive)', () => {
    const exactCss = 'x'.repeat(50);
    const result = buildCssInjection(
      [{ content: exactCss, href: '/assets/exact.css' }],
      50,
    );
    expect(result.html).toContain('<style data-vertz-css>');
    expect(result.filesToWrite).toEqual([]);
  });
});
```

#### F-03 (Severity: Low) — `href` not escaped in `<link>` tag HTML attribute

`build-css-injection.ts` line 32:
```ts
tags.push(`  <link rel="stylesheet" href="${source.href}" />`);
```

If `source.href` contains a `"` character, it will break out of the HTML attribute. In practice, the hrefs are controlled paths like `/assets/vertz.css`, so exploitation risk is minimal. But for a general-purpose pure function, this is a correctness gap.

**Fix:** Either:
- Escape `"` as `&quot;` in the href: `source.href.replace(/"/g, '&quot;')`
- Or add a runtime assertion that href matches a safe pattern (e.g., `/^\/[a-zA-Z0-9._\/-]+$/`)

This is low severity because all callers control the href values. A simple comment noting the assumption would also be acceptable.

### Approved (No Changes Needed)

#### Orphan cleanup logic is correct

The orphan cleanup in `build.ts` lines 94-105 correctly compares absolute paths: `bunCssFilePaths` contains `output.path` (absolute), and `linkedPaths` is constructed via `resolve(DIST, f.path.replace(/^\//, ''))` which produces the same absolute form. The `try/catch` around `unlinkSync` is appropriate — Bun may not always write CSS files to disk.

#### CSS source collection is correct

Bun CSS outputs are collected via `await output.text()` (not filesystem reads), and extracted component CSS is accumulated correctly. Both feed into the same `cssSources` array, ensuring uniform treatment.

#### Design doc alignment is complete

The function signature, threshold constant, `data-vertz-css` attribute, and `filesToWrite` return shape all match the design doc exactly. The integration in `build.ts` follows the 7-step plan from the design doc.

#### Empty sources edge case is tested

The test for empty `sources[]` array correctly asserts both `html === ''` and `filesToWrite === []`.

#### Custom threshold test is good

The test for a custom threshold (5 bytes) validates that the parameter override works correctly.

## Summary

The implementation is clean, well-structured, and matches the design doc. The pure function extraction is a good pattern. Three findings:

1. **F-01 (Medium):** `</style>` injection in CSS content — should be fixed before merge
2. **F-02 (Low):** Missing exactly-at-threshold boundary test — should be added
3. **F-03 (Low):** Unescaped `href` in link tag — low risk, acceptable to defer with a comment

**Recommendation:** Fix F-01 and F-02 before proceeding to merge. F-03 can be deferred with a code comment noting the assumption.

## Resolution

_Pending — awaiting fixes for F-01 and F-02._
