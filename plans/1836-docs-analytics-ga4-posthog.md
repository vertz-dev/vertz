# feat(docs): GA4 and PostHog Analytics Support

**Issue:** #1836
**Status:** Design
**Parent:** `plans/docs-framework.md` (Phase D — deferred)

## Context

`renderAnalyticsScript()` in `@vertz/docs` currently only supports Plausible. The original docs-framework design doc specified ga4/posthog/plausible but only Plausible was implemented. This completes that deferred work.

## API Surface

### Type additions

```ts
/** GA4 analytics configuration. */
export interface GA4Config {
  measurementId: string;
}

/** PostHog analytics configuration. */
export interface PostHogConfig {
  apiKey: string;
  apiHost?: string;
}

/** Analytics configuration. */
export interface AnalyticsConfig {
  plausible?: PlausibleConfig;
  ga4?: GA4Config;
  posthog?: PostHogConfig;
}
```

All new types (`GA4Config`, `PostHogConfig`) are exported from the package entrypoint (`index.ts`), consistent with `PlausibleConfig`.

### Usage

```ts
import { defineConfig } from '@vertz/docs';

export default defineConfig({
  name: 'My Docs',
  sidebar: [/* ... */],
  analytics: {
    plausible: { domain: 'docs.example.com' },
    ga4: { measurementId: 'G-XXXXXXXXXX' },
    posthog: { apiKey: 'phc_xxxxx', apiHost: 'https://us.i.posthog.com' },
  },
});
```

### Generated HTML

**GA4** — standard gtag.js snippet:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});</script>
```

The `measurementId` is escaped with `escapeHtml()` in the URL attribute and `JSON.stringify()` in the JS context.

**PostHog** — CDN script tag + init:
```html
<script async src="https://us-assets.i.posthog.com/static/array.js"></script>
<script>
  !function(t,e){e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){var u=e;void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init(${JSON.stringify(apiKey)},{api_host:${JSON.stringify(apiHost)}});
</script>
```

Default `apiHost` is `'https://us.i.posthog.com'`, applied at render time in `renderAnalyticsScript()`.

**Note:** The PostHog snippet uses a minimal stub that queues `init()` until the library loads from CDN. This is simpler and more maintainable than embedding the full PostHog bootstrapper inline. The CDN asset URL (`us-assets.i.posthog.com`) is PostHog's current asset hosting domain.

### Input Validation

All values interpolated into `<script>` tags are validated at render time:

- `measurementId` must match `/^G-[A-Z0-9]+$/` (GA4 format: `G-` + alphanumeric)
- `apiKey` must match `/^phc_[a-zA-Z0-9_]+$/` (PostHog format: `phc_` + alphanumeric/underscore)
- `apiHost` must match `/^https:\/\/[a-zA-Z0-9.-]+$/` (HTTPS hostname, no path/query/fragment)

Invalid values cause `renderAnalyticsScript()` to throw with a descriptive error message. Empty/whitespace strings are caught by truthiness checks (consistent with the existing Plausible pattern) — they are silently skipped, same as `analytics.plausible?.domain` being falsy.

For JS context interpolation, `JSON.stringify()` is used for defense-in-depth (properly escapes quotes, backslashes, and Unicode).

## Manifesto Alignment

- **Convention over configuration** — sensible defaults (PostHog apiHost defaults to US cloud)
- **If it builds, it works** — typed config catches invalid analytics setup at build time; runtime validation catches format errors
- **Extending an established pattern** — follows the exact same structure as the existing Plausible implementation

## Non-Goals

- **Analytics dashboard** — we inject scripts, we don't build analytics
- **Event tracking API** — users call gtag/posthog directly for custom events
- **CSP nonce injection** — separate concern, out of scope
- **Subresource integrity (SRI)** — third-party analytics scripts load from vendor CDNs without SRI pinning
- **Server-side analytics** — client-side script injection only

## Unknowns

None identified. Both GA4 and PostHog have well-documented client-side snippets. The Plausible pattern is already established.

## POC Results

N/A — trivial extension of existing pattern. No unknowns to validate.

## Type Flow Map

```
GA4Config.measurementId (string)
  → AnalyticsConfig.ga4
    → DocsConfig.analytics
      → renderAnalyticsScript(analytics)
        → validated → escapeHtml (URL attr) + JSON.stringify (JS context)
          → HTML string with measurement ID

PostHogConfig.apiKey (string)
PostHogConfig.apiHost (string | undefined → default 'https://us.i.posthog.com')
  → AnalyticsConfig.posthog
    → DocsConfig.analytics
      → renderAnalyticsScript(analytics)
        → validated → JSON.stringify (JS context)
          → HTML string with API key and host
```

No generics. All concrete string types. Type flow is trivial.

## E2E Acceptance Test

```ts
describe('Feature: GA4 and PostHog analytics support', () => {
  describe('Given a config with GA4 analytics', () => {
    describe('When renderAnalyticsScript() is called', () => {
      it('then generates gtag.js script with measurement ID', () => {
        const script = renderAnalyticsScript({ ga4: { measurementId: 'G-TEST123' } });
        expect(script).toContain('googletagmanager.com/gtag/js?id=G-TEST123');
        expect(script).toContain('G-TEST123');
      });
    });
  });

  describe('Given a config with PostHog analytics', () => {
    describe('When renderAnalyticsScript() is called', () => {
      it('then generates PostHog init script with API key and default host', () => {
        const script = renderAnalyticsScript({ posthog: { apiKey: 'phc_test123' } });
        expect(script).toContain('posthog');
        expect(script).toContain('phc_test123');
        expect(script).toContain('https://us.i.posthog.com');
      });
    });
  });

  describe('Given a config with PostHog and custom apiHost', () => {
    describe('When renderAnalyticsScript() is called', () => {
      it('then uses the custom API host', () => {
        const script = renderAnalyticsScript({
          posthog: { apiKey: 'phc_test', apiHost: 'https://eu.i.posthog.com' },
        });
        expect(script).toContain('https://eu.i.posthog.com');
      });
    });
  });

  describe('Given a config with all three providers', () => {
    describe('When renderAnalyticsScript() is called', () => {
      it('then generates scripts for all providers', () => {
        const script = renderAnalyticsScript({
          plausible: { domain: 'docs.example.com' },
          ga4: { measurementId: 'G-MULTI' },
          posthog: { apiKey: 'phc_multi' },
        });
        expect(script).toContain('plausible.io');
        expect(script).toContain('G-MULTI');
        expect(script).toContain('phc_multi');
      });
    });
  });

  describe('Given a config with no analytics providers', () => {
    describe('When renderAnalyticsScript() is called', () => {
      it('then returns empty string', () => {
        const script = renderAnalyticsScript({});
        expect(script).toBe('');
      });
    });
  });

  describe('Given a GA4 config with invalid measurementId format', () => {
    describe('When renderAnalyticsScript() is called', () => {
      it('then throws a validation error', () => {
        expect(() => renderAnalyticsScript({
          ga4: { measurementId: "G-TEST'><script>alert(1)</script>" },
        })).toThrow(/invalid.*measurementId/i);
      });
    });
  });

  describe('Given a PostHog config with invalid apiKey format', () => {
    describe('When renderAnalyticsScript() is called', () => {
      it('then throws a validation error', () => {
        expect(() => renderAnalyticsScript({
          posthog: { apiKey: "bad');alert(1);//" },
        })).toThrow(/invalid.*apiKey/i);
      });
    });
  });

  describe('Given a PostHog config with invalid apiHost', () => {
    describe('When renderAnalyticsScript() is called', () => {
      it('then throws a validation error', () => {
        expect(() => renderAnalyticsScript({
          posthog: { apiKey: 'phc_valid', apiHost: 'javascript:alert(1)' },
        })).toThrow(/invalid.*apiHost/i);
      });
    });
  });

  // Invalid usage — type errors
  // @ts-expect-error — ga4 requires measurementId
  renderAnalyticsScript({ ga4: {} });

  // @ts-expect-error — posthog requires apiKey
  renderAnalyticsScript({ posthog: {} });
});
```
