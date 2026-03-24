/**
 * Template splitting for progressive HTML streaming.
 *
 * Pre-splits an HTML template into head and tail portions at the SSR outlet
 * marker. This runs once at handler creation time (not per-request), enabling
 * the head to be sent immediately while the body is still rendering.
 */

export interface SplitTemplateOptions {
  /**
   * Map of CSS asset URLs to their content for inlining.
   * Replaces `<link rel="stylesheet" href="...">` tags with inline `<style>` tags
   * and converts remaining stylesheet links to async loading.
   */
  inlineCSS?: Record<string, string>;
}

export interface SplitTemplateResult {
  /** Everything before the SSR outlet (doctype, head, opening body/app div). */
  headTemplate: string;
  /** Everything after the SSR outlet (closing tags, end of body/html). */
  tailTemplate: string;
}

/**
 * Split an HTML template at the SSR outlet marker into head and tail portions.
 *
 * Supports two outlet formats:
 * - `<!--ssr-outlet-->` — splits at the comment
 * - `<div id="app">` — splits after the opening tag (balanced div counting)
 *
 * When `inlineCSS` is provided, stylesheet `<link>` tags are replaced with
 * inline `<style>` tags and remaining links are converted to async loading.
 */
export function splitTemplate(
  template: string,
  options?: SplitTemplateOptions,
): SplitTemplateResult {
  // Apply CSS inlining before splitting (operates on the full template string)
  let processed = template;
  if (options?.inlineCSS) {
    processed = inlineCSSAssets(processed, options.inlineCSS);
  }

  // Try <!--ssr-outlet--> first
  const outletMarker = '<!--ssr-outlet-->';
  const outletIndex = processed.indexOf(outletMarker);
  if (outletIndex !== -1) {
    return {
      headTemplate: processed.slice(0, outletIndex),
      tailTemplate: processed.slice(outletIndex + outletMarker.length),
    };
  }

  // Try <div id="app">
  const appDivMatch = processed.match(/<div[^>]*id="app"[^>]*>/);
  if (appDivMatch && appDivMatch.index != null) {
    const openTag = appDivMatch[0];
    const contentStart = appDivMatch.index + openTag.length;

    // Walk forward counting balanced <div>...</div> pairs to find the matching </div>
    const closingIndex = findMatchingDivClose(processed, contentStart);

    return {
      headTemplate: processed.slice(0, contentStart),
      tailTemplate: processed.slice(closingIndex),
    };
  }

  throw new Error(
    'Could not find <!--ssr-outlet--> or <div id="app"> in the HTML template. ' +
      'The template must contain one of these markers for SSR content injection.',
  );
}

/**
 * Find the matching </div> for an already-opened <div>, using balanced tag counting.
 * Returns the index of the '<' in the matching '</div>'.
 */
function findMatchingDivClose(html: string, startAfterOpen: number): number {
  let depth = 1;
  let i = startAfterOpen;
  const len = html.length;

  while (i < len && depth > 0) {
    if (html[i] === '<') {
      if (html.startsWith('</div>', i)) {
        depth--;
        if (depth === 0) return i;
        i += 6;
      } else if (html.startsWith('<div', i) && /^<div[\s>]/.test(html.slice(i, i + 5))) {
        depth++;
        i += 4;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  // Couldn't find matching </div> — return end of string as fallback
  return len;
}

/**
 * Replace stylesheet <link> tags with inline <style> tags and convert
 * remaining stylesheet links to async loading.
 */
function inlineCSSAssets(html: string, inlineCSS: Record<string, string>): string {
  let result = html;

  // First, replace matched links with inline styles
  for (const [href, css] of Object.entries(inlineCSS)) {
    const escapedHref = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkPattern = new RegExp(`<link[^>]*href=["']${escapedHref}["'][^>]*>`);
    // Escape </ sequences in CSS to prevent premature </style> closing
    const safeCss = css.replace(/<\//g, '<\\/');
    result = result.replace(linkPattern, `<style data-vertz-css>${safeCss}</style>`);
  }

  // Convert remaining stylesheet links to async loading pattern
  result = result.replace(
    /<link\s+rel="stylesheet"\s+href="([^"]+)"[^>]*>/g,
    (match, href) =>
      `<link rel="stylesheet" href="${href}" media="print" onload="this.media='all'">\n    <noscript>${match}</noscript>`,
  );

  return result;
}
