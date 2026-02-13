# ui-017: globalCss() does not auto-inject like css() does

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 1h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Priority:** P1 (inconsistency bug)

## Description

`css()` auto-injects generated CSS into `document.head` via `<style data-vertz-css>` tags (added in commit `0fa47ae`). `globalCss()` does NOT — it returns `{ css: string }` and requires manual injection:

```ts
const globalStyles = globalCss({ body: { fontFamily: 'system-ui' } });
// Must manually do:
const el = document.createElement('style');
el.textContent = globalStyles.css;
document.head.appendChild(el);
```

In the task-manager demo, Josh had to write 3 separate manual `<style>` injection blocks in the entry point. The asymmetry between `css()` (auto-injects) and `globalCss()` (doesn't) is confusing — developers expect them to behave the same way.

The `injectCSS()` helper already exists inside `css.ts`. This fix just needs to call it from `globalCss()`.

## Acceptance Criteria

- [ ] `globalCss()` auto-injects into `document.head` in browser environments (same as `css()`)
- [ ] Deduplication works (calling `globalCss()` with the same input twice only injects once)
- [ ] Returns `{ css: string }` unchanged (SSR/build-time extraction still works)
- [ ] No injection in non-browser environments (`typeof document === 'undefined'`)
- [ ] New test: `globalCss()` injects a `<style data-vertz-css>` tag into `document.head`
- [ ] New test: duplicate calls don't inject twice

## Progress

- 2026-02-12: Ticket created from PR #210 DX review (ava + nora)
- 2026-02-12: Already fixed in commit a454791 (PR #229) — globalCss() calls injectCSS() with dedup
