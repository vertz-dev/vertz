---
'@vertz/docs': patch
---

Add GA4 and PostHog analytics support to `renderAnalyticsScript()`. All three providers (Plausible, GA4, PostHog) can be configured simultaneously. Includes input validation and XSS protection for all interpolated values.
