import { compileTheme, type Theme } from '@vertz/ui';
import { installDomShim, removeDomShim, SSRElement } from './dom-shim';
import { renderPage } from './render-page';
import { ssrStorage } from './ssr-context';
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
  options: RenderToHTMLOptions<AppFn>,
): Promise<string> {
  // Install DOM shim for SSR
  installDomShim();

  // Use AsyncLocalStorage for per-request SSR context
  // (ssrStorage.run() activates the __VERTZ_IS_SSR__ hook read by @vertz/ui's isSSR())
  return ssrStorage.run({ url: options.url }, async () => {
    try {
      // 1. Render app first — this triggers css()/injectCSS() calls that append
      //    <style> elements to the fake document.head
      const vnode = app();

      // 2. Collect CSS injected into fake document.head during render
      // biome-ignore lint/suspicious/noExplicitAny: SSR shim requires globalThis augmentation
      const fakeDoc = (globalThis as any).document;
      const collectedCSS: string[] = [];
      if (fakeDoc?.head?.children) {
        for (const child of fakeDoc.head.children) {
          if (child instanceof SSRElement && child.tag === 'style') {
            const cssText = child.children?.join('') ?? '';
            if (cssText) collectedCSS.push(cssText);
          }
        }
      }

      // 3. Compile theme CSS
      const themeCss = options.theme ? compileTheme(options.theme).css : '';

      // 4. Combine: theme + explicit styles + collected component CSS
      const allStyles = [themeCss, ...(options.styles ?? []), ...collectedCSS].filter(Boolean);

      // Build head entries for styles
      const styleTags = allStyles.map((css) => `<style>${css}</style>`).join('\n');

      // Build meta tags
      const metaHtml =
        options.head?.meta
          ?.map(
            (m) =>
              `<meta ${m.name ? `name="${m.name}"` : `property="${m.property}"`} content="${m.content}">`,
          )
          .join('\n') ?? '';

      // Build link tags
      const linkHtml =
        options.head?.links
          ?.map((link) => `<link rel="${link.rel}" href="${link.href}">`)
          .join('\n') ?? '';

      // Combine head content: meta + links + styles
      const headContent = [metaHtml, linkHtml, styleTags].filter(Boolean).join('\n');

      // Call renderPage with the pre-rendered VNode
      const response = renderPage(vnode, {
        title: options.head?.title,
        head: headContent,
      });

      // Extract and return HTML string
      return await response.text();
    } finally {
      // Cleanup DOM shim (AsyncLocalStorage context is automatically cleaned up)
      removeDomShim();
    }
  });
}
