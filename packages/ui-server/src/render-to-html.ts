import { compileTheme, type Theme } from '@vertz/ui';
import { installDomShim, removeDomShim } from './dom-shim';
import { renderPage } from './render-page';
import type { VNode } from './types';

export interface RenderToHTMLOptions<AppFn extends () => VNode> {
  /** The app component function */
  app: AppFn;
  /** Request URL for SSR */
  url: string;
  /** Theme definition for CSS vars */
  theme?: Theme;
  /** Global CSS strings to inject */
  styles?: string[];
  /** HTML head configuration */
  head?: {
    title?: string;
    meta?: Array<{ name?: string; property?: string; content: string }>;
    links?: Array<{ rel: string; href: string }>;
  };
  /** Container selector (default '#app') */
  container?: string;
}

/**
 * Render a VNode to a full HTML string.
 *
 * This is a wrapper around renderPage() that provides a simpler API for
 * theme and style injection.
 *
 * @param app - The app component function (called to produce VNode)
 * @param options - Render options including url, theme, styles, head
 * @returns Promise<string> - The rendered HTML string
 *
 * @example
 * ```ts
 * import { renderToHTML, defineTheme } from '@vertz/ui-server';
 *
 * const theme = defineTheme({
 *   colors: { primary: { DEFAULT: '#3b82f6' } }
 * });
 *
 * const html = await renderToHTML(App, {
 *   url: '/',
 *   theme,
 *   styles: ['body { margin: 0; }'],
 *   head: { title: 'My App' }
 * });
 * ```
 */
export async function renderToHTML<AppFn extends () => VNode>(
  app: AppFn,
  options: RenderToHTMLOptions<AppFn>
): Promise<string> {
  // Install DOM shim for SSR
  installDomShim();
  // Set the SSR URL global for routing
  (globalThis as any).__SSR_URL__ = options.url;

  try {
    // Compile theme CSS
    const themeCss = options.theme ? compileTheme(options.theme).css : '';

    // Collect all styles (theme + custom)
    const allStyles = [themeCss, ...options.styles ?? []].filter(Boolean);

    // Build head entries for styles
    const styleTags = allStyles
      .map((css) => `<style>${css}</style>`)
      .join('\n');

    // Build meta tags
    const metaHtml = options.head?.meta
      ?.map(
        (m) =>
          `<meta ${m.name ? `name="${m.name}"` : `property="${m.property}"`} content="${m.content}">`
      )
      .join('\n') ?? '';

    // Build link tags
    const linkHtml = options.head?.links
      ?.map((link) => `<link rel="${link.rel}" href="${link.href}">`)
      .join('\n') ?? '';

    // Combine head content: meta + links + styles
    const headContent = [metaHtml, linkHtml, styleTags].filter(Boolean).join('\n');

    // Call renderPage
    const response = renderPage(app(), {
      title: options.head?.title,
      head: headContent,
    });

    // Extract and return HTML string
    return await response.text();
  } finally {
    // Cleanup global and dom shim
    delete (globalThis as any).__SSR_URL__;
    removeDomShim();
  }
}
