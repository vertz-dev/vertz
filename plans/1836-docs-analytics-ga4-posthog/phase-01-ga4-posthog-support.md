# Phase 1: GA4 and PostHog Analytics Support

## Context

Extend `renderAnalyticsScript()` in `@vertz/docs` to support GA4 and PostHog in addition to Plausible. Design doc: `plans/1836-docs-analytics-ga4-posthog.md`. Issue: #1836.

## Tasks

### Task 1: Add GA4 and PostHog types + input validation

**Files:**
- `packages/docs/src/config/types.ts` (modified)
- `packages/docs/src/ssg/head-injection.ts` (modified)
- `packages/docs/src/__tests__/ssg-completions.test.ts` (modified)

**What to implement:**

1. Add `GA4Config` and `PostHogConfig` interfaces to `types.ts`
2. Extend `AnalyticsConfig` to include `ga4?` and `posthog?` fields
3. Add validation functions for `measurementId`, `apiKey`, and `apiHost`
4. Extend `renderAnalyticsScript()` with GA4 script generation (gtag.js snippet)
5. Extend `renderAnalyticsScript()` with PostHog script generation (CDN + minimal stub)
6. Export new types from `packages/docs/src/index.ts`

**Acceptance criteria:**
- [ ] `GA4Config` type has required `measurementId: string`
- [ ] `PostHogConfig` type has required `apiKey: string` and optional `apiHost?: string`
- [ ] `AnalyticsConfig` includes `ga4?` and `posthog?`
- [ ] GA4: generates `<script async src="googletagmanager.com/gtag/js?id=...">` + inline gtag config
- [ ] PostHog: generates `<script async src="us-assets.i.posthog.com/static/array.js">` + init script
- [ ] PostHog: defaults `apiHost` to `'https://us.i.posthog.com'`
- [ ] PostHog: uses custom `apiHost` when provided
- [ ] All three providers work simultaneously
- [ ] Empty config returns empty string
- [ ] `measurementId` validated against `/^G-[A-Z0-9]+$/`, throws on invalid
- [ ] `apiKey` validated against `/^phc_[a-zA-Z0-9_]+$/`, throws on invalid
- [ ] `apiHost` validated against `/^https:\/\/[a-zA-Z0-9.-]+$/`, throws on invalid
- [ ] `JSON.stringify()` used for JS-context interpolation
- [ ] `escapeHtml()` used for HTML-attribute interpolation
- [ ] `GA4Config` and `PostHogConfig` exported from `index.ts`
- [ ] All tests pass, typecheck clean, lint clean
