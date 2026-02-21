# ui-022: Add CSP nonce parameter to renderToStream

- **Status:** 🟢 Done
- **Assigned:** nora
- **Phase:** v0.1.x patch
- **Estimate:** 3h
- **Blocked by:** none
- **Blocks:** none
- **PR:** —
- **Source:** mike review on PR #199 (should-fix #6)

## Description

The design doc specifies a `nonce` parameter for `renderToStream()` to support Content Security Policy headers. Without it, inline scripts generated during SSR will be blocked on sites with strict CSP policies.

**File:** `packages/ui-server/src/stream.ts`

## Acceptance Criteria

- [ ] `renderToStream()` accepts an optional `nonce` parameter
- [ ] When provided, all inline `<script>` tags include `nonce="..."` attribute
- [ ] Test: renderToStream with nonce produces scripts with nonce attribute
- [ ] Test: renderToStream without nonce produces scripts without nonce (backward compat)
- [ ] Type: `RenderToStreamOptions` type includes optional `nonce: string`

## Progress

- 2026-02-12: Ticket created from mike's review on PR #199
- 2026-02-12: Implemented — RenderToStreamOptions.nonce, escapeNonce() XSS prevention, 7 new tests, 66 total passing
