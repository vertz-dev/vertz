import type { AnalyticsConfig, HeadTag } from '../config/types';
import { escapeHtml } from '../dev/escape-html';

const VOID_TAGS = new Set(['meta', 'link', 'base', 'br', 'hr', 'img', 'input']);

/**
 * Render an array of HeadTag config entries to HTML strings.
 */
export function renderHeadTags(tags: HeadTag[]): string {
  return tags
    .map((t) => {
      const attrs = t.attrs
        ? Object.entries(t.attrs)
            .map(([k, v]) => {
              if (v === true) return ` ${k}`;
              if (v === false) return '';
              return ` ${k}="${escapeHtml(String(v))}"`;
            })
            .join('')
        : '';

      if (VOID_TAGS.has(t.tag)) {
        return `<${t.tag}${attrs} />`;
      }
      return `<${t.tag}${attrs}>${t.content ?? ''}</${t.tag}>`;
    })
    .join('\n');
}

const GA4_ID_RE = /^G-[A-Z0-9]+$/;
const POSTHOG_KEY_RE = /^phc_[a-zA-Z0-9_]+$/;
const POSTHOG_HOST_RE = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/;
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * Render analytics script tags from config.
 */
export function renderAnalyticsScript(analytics: AnalyticsConfig): string {
  const scripts: string[] = [];

  if (analytics.plausible?.domain) {
    scripts.push(
      `<script defer data-domain="${escapeHtml(analytics.plausible.domain)}" src="https://plausible.io/js/script.js"></script>`,
    );
  }

  if (analytics.ga4?.measurementId) {
    const id = analytics.ga4.measurementId;
    if (!GA4_ID_RE.test(id)) {
      throw new Error(
        `Invalid GA4 measurementId: ${JSON.stringify(id)}. Expected format: G-XXXXXXXXXX`,
      );
    }
    scripts.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapeHtml(id)}"></script>`,
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(id)});</script>`,
    );
  }

  if (analytics.posthog?.apiKey) {
    const key = analytics.posthog.apiKey;
    const host = analytics.posthog.apiHost ?? DEFAULT_POSTHOG_HOST;
    if (!POSTHOG_KEY_RE.test(key)) {
      throw new Error(`Invalid PostHog apiKey: ${JSON.stringify(key)}. Expected format: phc_xxxxx`);
    }
    if (!POSTHOG_HOST_RE.test(host)) {
      throw new Error(`Invalid PostHog apiHost: ${JSON.stringify(host)}. Expected HTTPS hostname`);
    }
    const assetHost = host.replace('.i.posthog.com', '-assets.i.posthog.com');
    scripts.push(
      `<script>!function(t,e){e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=${JSON.stringify(assetHost)}+"/static/array.full.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var o,n,p,r,u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onFeatureFlags onSessionId setPersonProperties".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(key)},{api_host:${JSON.stringify(host)}});</script>`,
    );
  }

  return scripts.join('\n');
}
