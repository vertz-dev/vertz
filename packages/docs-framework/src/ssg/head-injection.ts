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

  return scripts.join('\n');
}
