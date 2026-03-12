# Adversarial Review: Runtime Image Optimization at the Edge

- **Author:** Claude (implementation)
- **Reviewer:** Claude (adversarial review)
- **Commits:** 1f4f4918..592a964c
- **Date:** 2026-03-11

## Changes

- `packages/cloudflare/package.json` (modified) — add `./image` subpath export
- `packages/cloudflare/src/handler.ts` (modified) — wire `imageOptimizer` into route matching
- `packages/cloudflare/src/image-optimizer.ts` (new) — edge image optimizer handler
- `packages/cloudflare/tests/handler.test-d.ts` (new) — type-level tests for handler config
- `packages/cloudflare/tests/handler.test.ts` (modified) — integration tests for optimizer routing
- `packages/cloudflare/tests/image-optimizer.test-d.ts` (new) — type-level tests for optimizer config
- `packages/cloudflare/tests/image-optimizer.test.ts` (new) — unit tests for optimizer handler
- `packages/ui-server/src/__tests__/dev-image-proxy-integration.test.ts` (new) — E2E integration test
- `packages/ui-server/src/__tests__/dev-image-proxy.test.ts` (new) — unit tests for dev proxy
- `packages/ui-server/src/bun-dev-server.ts` (modified) — add `/_vertz/image` route
- `packages/ui-server/src/dev-image-proxy.ts` (new) — dev-mode image proxy handler
- `packages/ui/src/image/__tests__/config.test.ts` (new) — unit tests for URL rewriting config
- `packages/ui/src/image/__tests__/image.test-d.ts` (modified) — type-level tests for configureImageOptimizer
- `packages/ui/src/image/__tests__/image.test.ts` (modified) — Image component optimizer integration tests
- `packages/ui/src/image/config.ts` (new) — configureImageOptimizer + buildOptimizedUrl
- `packages/ui/src/image/image.ts` (modified) — integrate buildOptimizedUrl into Image component
- `packages/ui/src/index.ts` (modified) — export new image config APIs
- `.changeset/edge-image-optimizer.md` (new) — changeset

## CI Status

- [ ] Full quality gates pending

## Review Checklist

- [x] Delivers what the ticket asks for
- [x] TDD compliance (all acceptance criteria from design doc have corresponding tests)
- [ ] No type gaps or missing edge cases (see findings)
- [x] No critical security issues (see suggestions for hardening)
- [x] Public API changes match design doc

## Findings

### BLOCKING

#### B1. Missing dev-mode info message for non-HTTP dynamic `src`

**File:** `packages/ui/src/image/image.ts`

The design doc (Rev 2, post-review) explicitly lists a **blocking DX requirement** (DX #2): when `configureImageOptimizer` is active and `<Image>` encounters a dynamic `src` that is NOT an absolute HTTP URL, the component should log a dev-mode info message:

```
[vertz] <Image src="/uploads/photo.jpg"> — relative/non-HTTP src, not optimized by edge optimizer. Use an absolute URL (https://...) for edge optimization.
```

The Phase 1 deliverables list this as a required output:
> "Dev-mode info message when optimizer is active but `src` is not an absolute HTTP URL"

The implementation does NOT include this log. The `Image` component silently falls back to the original `src` when `buildOptimizedUrl` returns `null`. This contradicts the design doc which states this was a blocking finding addressed in Rev 2.

**Impact:** Developers using `configureImageOptimizer` with relative-path `src` values will get no feedback that their images are not being edge-optimized. Silent failure is exactly what this log was designed to prevent.

**Fix:** Add a conditional `console.info(...)` in `image.ts` when the optimizer is configured (`getOptimizerBaseUrl() !== null`) but `buildOptimizedUrl` returns `null` (src is not absolute HTTP). Gate behind `process.env.NODE_ENV !== 'production'` or similar dev-mode check.

---

#### B2. `resetImageOptimizer_TEST_ONLY` exported from `@vertz/ui` public API

**File:** `packages/ui/src/index.ts`, line 110

`resetImageOptimizer_TEST_ONLY` is exported from the public `@vertz/ui` barrel export. This is a test-only function (marked `@internal` in `config.ts`) that resets module-level state. Exposing it in the public API:

1. Pollutes the public API surface with a test helper
2. Could be accidentally used by consumers, causing subtle state corruption
3. Violates the principle that internal test utilities should not be part of the public contract

**Fix:** Remove `resetImageOptimizer_TEST_ONLY` from `packages/ui/src/index.ts`. Tests in `packages/ui` already import directly from `../config` (relative path). The `packages/ui-server` integration test imports from `@vertz/ui` — it should either use a separate test import path or restructure to not need the reset (e.g., test isolation via module re-evaluation).

---

#### B3. `getOptimizerBaseUrl` exported from config but unused and not tested

**File:** `packages/ui/src/image/config.ts`, line 6

`getOptimizerBaseUrl()` is defined and exported but:
- Never imported or used anywhere in the codebase
- Not exported from `@vertz/ui` index
- Has no test coverage

Dead code that ships in the bundle. If it is intended for future use (e.g., the dev-mode info message in B1), it should be used. If not, remove it.

**Fix:** Either use it (for the dev-mode info message in B1) or remove it.

---

### SUGGESTIONS

#### S1. No `quality` validation or clamping in the edge optimizer

**File:** `packages/cloudflare/src/image-optimizer.ts`, line 108

The `quality` parameter from the request is parsed with `Number(...) || defaultQuality` but never clamped to the valid range (1-100). A request with `q=999` or `q=-5` is passed directly to `cf.image`. While `cf.image` may handle this gracefully, the design doc specifies "Quality 1-100" and the optimizer should enforce its own documented contract.

Similarly, `fit` is accepted as any string (line 109) without validation against the documented values (`cover`, `contain`, `fill`). An invalid `fit` value like `fit=evil` is passed directly to `cf.image`.

**Fix:** Clamp quality to `Math.max(1, Math.min(100, quality))`. Validate `fit` against `['cover', 'contain', 'fill']` with fallback to `'cover'`.

---

#### S2. No test for `w=0` or negative width/height in the edge optimizer

**File:** `packages/cloudflare/tests/image-optimizer.test.ts`

The validation `!w || !h` at line 78 of `image-optimizer.ts` correctly rejects `w=0` (falsy), but there is no test verifying this behavior. Negative values like `w=-100` pass the validation (truthy, not NaN) and are forwarded to `cf.image`. This could lead to unexpected behavior.

**Fix:** Add tests for `w=0`, `h=0`, `w=-1`, `h=-1`. Consider adding `w > 0 && h > 0` validation.

---

#### S3. IP address regex does not catch `localhost`

**File:** `packages/cloudflare/src/image-optimizer.ts`, line 38

The `IP_REGEX` catches standard IPv4, IPv6, hex integers, and large decimal integers. However, `localhost` is not caught — `isIPAddress('localhost')` returns `false`, but `localhost` resolves to `127.0.0.1`.

The `allowedDomains` exact-match check mitigates this: `localhost` would only be accepted if explicitly listed in `allowedDomains`. But if a developer accidentally adds `localhost` to `allowedDomains`, it becomes an SSRF vector to the Worker's loopback.

DNS rebinding domains like `127.0.0.1.xip.io` are also not caught by the IP regex, but again, `allowedDomains` exact matching prevents exploitation unless explicitly listed.

**Fix:** Consider adding `hostname === 'localhost'` check alongside `isIPAddress()`. Or document that `localhost` should never appear in `allowedDomains`.

---

#### S4. `jsonError` function duplicated across two files

**Files:**
- `packages/cloudflare/src/image-optimizer.ts`, line 31
- `packages/ui-server/src/dev-image-proxy.ts`, line 6

Identical `jsonError(error, status)` helper duplicated in both files. While minor, this is a maintenance burden if the error format changes.

**Fix:** If both packages share a dependency where this could live, extract it. Otherwise, accept the duplication as the cost of package isolation (acceptable for now).

---

#### S5. Dev proxy does not validate Content-Type of upstream response

**File:** `packages/ui-server/src/dev-image-proxy.ts`

The production edge optimizer validates that the upstream response has `Content-Type: image/*` (line 156 of `image-optimizer.ts`). The dev proxy does not — it will proxy an HTML page, a JSON response, or any other content type as an "image". This could mask bugs during development where the wrong URL is configured.

**Fix:** Add a Content-Type check in the dev proxy matching the production behavior, or at minimum log a warning when the upstream response is not `image/*`.

---

#### S6. Missing test for `fetchTimeout` configuration

**File:** `packages/cloudflare/tests/image-optimizer.test.ts`

The `ImageOptimizerConfig.fetchTimeout` option is never tested. There is no test that creates an optimizer with a custom `fetchTimeout` value and verifies the timeout is applied. The timeout test uses the default handler, not one with a custom timeout.

**Fix:** Add a test case with a custom `fetchTimeout` and verify the `AbortSignal.timeout()` call uses the configured value.

---

#### S7. `buildOptimizedUrl` uses string concatenation for URL construction

**File:** `packages/ui/src/image/config.ts`, line 33

```ts
return `${optimizerBaseUrl}?${params}`;
```

This assumes `optimizerBaseUrl` is always a simple path without existing query parameters. If someone calls `configureImageOptimizer('/_vertz/image?extra=1')`, the result would be `/_vertz/image?extra=1?url=...` which is malformed.

**Fix:** Low risk since the documented API only shows `/_vertz/image` as the argument, but using `new URL(optimizerBaseUrl, 'http://localhost')` and appending search params would be more robust. Alternatively, validate the input in `configureImageOptimizer` to reject strings containing `?`.

---

#### S8. Route matching uses exact `pathname === '/_vertz/image'` — intentional, no fix needed

**Files:**
- `packages/cloudflare/src/handler.ts`, line 273
- `packages/ui-server/src/bun-dev-server.ts`, line 1131

Exact match means `/_vertz/image/` (with trailing slash) or `/_vertz/image/subpath` would NOT match. This is correct behavior (the API expects query params, not path segments), and is consistent with the design doc which specifies `/_vertz/image` as the exact route.

No fix needed — noting the intentional design for the record.

---

#### S9. No documentation update in `packages/docs/`

The `.claude/rules/workflow.md` states:
> "Docs updated — if the PR introduces new APIs, changes existing behavior, or adds features, update packages/docs/ (Mintlify)"

This PR introduces `configureImageOptimizer`, `imageOptimizer()`, and `@vertz/cloudflare/image` — all new public APIs. No documentation files were updated.

**Fix:** Add documentation for the image optimization feature in `packages/docs/`.

---

#### S10. Handler integration test does not verify error responses get security headers

**File:** `packages/cloudflare/tests/handler.test.ts`

The test "applies security headers to optimizer responses" tests the success path only. Error responses from the optimizer (e.g., 403 for invalid domain) also go through `applyHeaders()`. There is no test verifying that error responses from the optimizer also receive security headers.

**Fix:** Add a test where the optimizer returns a 403 error and verify security headers are present on the error response.

## Resolution

(to be filled after addressing findings)
