/** 15 KiB raw (uncompressed) — CSS below this threshold is inlined as <style> tags. */
export const CSS_INLINE_THRESHOLD = 15 * 1024;

export interface CssSource {
  /** Raw CSS content */
  content: string;
  /** Path to reference in <link> if not inlined (e.g., '/assets/vertz.css') */
  href: string;
}

export interface CssInjectionResult {
  /** HTML string of <style> and/or <link> tags */
  html: string;
  /** CSS sources that exceeded threshold and need to be written to disk */
  filesToWrite: Array<{ path: string; content: string }>;
}

/**
 * Decide whether to inline CSS as <style> or link as <link>, per source.
 * Pure function — caller handles disk I/O.
 */
export function buildCssInjection(
  sources: CssSource[],
  threshold: number = CSS_INLINE_THRESHOLD,
): CssInjectionResult {
  const tags: string[] = [];
  const filesToWrite: CssInjectionResult['filesToWrite'] = [];

  for (const source of sources) {
    if (source.content.length <= threshold) {
      // Escape </style to prevent premature tag closure (and potential XSS)
      const safeCss = source.content.replace(/<\/style/gi, '<\\/style');
      tags.push(`  <style data-vertz-css>${safeCss}</style>`);
    } else {
      tags.push(`  <link rel="stylesheet" href="${source.href}" />`);
      filesToWrite.push({ path: source.href, content: source.content });
    }
  }

  return { html: tags.join('\n'), filesToWrite };
}
