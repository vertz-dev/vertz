/**
 * Inline critical CSS as a `<style>` tag.
 *
 * Wraps the provided CSS in `<style>...</style>` for embedding in the HTML head.
 * Escapes any `</style>` sequences in the CSS content to prevent injection.
 *
 * Returns an empty string if the CSS is empty.
 */
export function inlineCriticalCss(css: string): string {
  if (css === '') return '';

  // Escape closing style tags to prevent breaking out of the style element
  const safeCss = css.replace(/<\/style>/gi, '<\\/style>');

  return `<style>${safeCss}</style>`;
}
