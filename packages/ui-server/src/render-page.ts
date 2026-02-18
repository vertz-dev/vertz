import { renderHeadToHtml } from './head';
import { renderToStream } from './render-to-stream';
import { encodeChunk } from './streaming';
import type { HeadEntry, VNode } from './types';

export interface PageOptions {
  /** HTTP status code (default: 200) */
  status?: number;
  /** Page title */
  title?: string;
  /** Meta description */
  description?: string;
  /** Language attribute (default: 'en') */
  lang?: string;
  /** Favicon URL */
  favicon?: string;
  /** Open Graph meta tags */
  og?: {
    /** OG title (falls back to title) */
    title?: string;
    /** OG description (falls back to description) */
    description?: string;
    /** OG image URL */
    image?: string;
    /** OG canonical URL */
    url?: string;
    /** OG type (default: 'website') */
    type?: string;
  };
  /** Twitter card meta tags */
  twitter?: {
    /** Twitter card type */
    card?: string;
    /** Twitter @username */
    site?: string;
  };
  /** Array of script URLs to include at end of body */
  scripts?: string[];
  /** Array of stylesheet URLs to include in head */
  styles?: string[];
  /** Raw HTML escape hatch for head */
  head?: string;
}

/**
 * Build the <head> HTML string from PageOptions.
 * Merges component HeadCollector entries with PageOptions defaults.
 */
function buildHeadHtml(options: PageOptions, _componentHeadEntries: HeadEntry[] = []): string {
  const entries: HeadEntry[] = [];

  // Base meta tags
  entries.push({ tag: 'meta', attrs: { charset: 'utf-8' } });
  entries.push({
    tag: 'meta',
    attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' },
  });

  // Title
  if (options.title) {
    entries.push({ tag: 'title', textContent: options.title });
  }

  // Description
  if (options.description) {
    entries.push({ tag: 'meta', attrs: { name: 'description', content: options.description } });
  }

  // Open Graph - generate if og is provided OR if there's a title/description
  const hasOgConfig = options.og != null;
  const hasTitleOrDesc = options.title != null || options.description != null;

  if (hasOgConfig || hasTitleOrDesc) {
    const ogTitle = options.og?.title ?? options.title ?? '';
    const ogDesc = options.og?.description ?? options.description ?? '';

    if (ogTitle) {
      entries.push({ tag: 'meta', attrs: { property: 'og:title', content: ogTitle } });
    }

    if (ogDesc) {
      entries.push({ tag: 'meta', attrs: { property: 'og:description', content: ogDesc } });
    }

    if (options.og?.image) {
      entries.push({ tag: 'meta', attrs: { property: 'og:image', content: options.og.image } });
    }

    if (options.og?.url) {
      entries.push({ tag: 'meta', attrs: { property: 'og:url', content: options.og.url } });
    }

    entries.push({
      tag: 'meta',
      attrs: { property: 'og:type', content: options.og?.type ?? 'website' },
    });
  }

  // Twitter Card
  if (options.twitter) {
    if (options.twitter.card) {
      entries.push({ tag: 'meta', attrs: { name: 'twitter:card', content: options.twitter.card } });
    }
    if (options.twitter.site) {
      entries.push({ tag: 'meta', attrs: { name: 'twitter:site', content: options.twitter.site } });
    }
  }

  // Favicon
  if (options.favicon) {
    entries.push({ tag: 'link', attrs: { rel: 'icon', href: options.favicon } });
  }

  // Styles
  if (options.styles) {
    for (const style of options.styles) {
      entries.push({ tag: 'link', attrs: { rel: 'stylesheet', href: style } });
    }
  }

  // Head escape hatch (raw HTML)
  // This is handled separately in the full page build

  return renderHeadToHtml(entries);
}

/**
 * Render a VNode to a full HTML Response with common page structure.
 *
 * This is the main entry point for zero-boilerplate SSR. It wraps the component
 * in a complete HTML document with doctype, head (meta, OG, Twitter, favicon,
 * styles), and body (component content + scripts).
 *
 * @param vnode - The root VNode to render
 * @param options - Optional page configuration
 * @returns A Response with text/html content-type
 *
 * @example
 * ```ts
 * // Minimal usage
 * return renderPage(App)
 *
 * // Full options
 * return renderPage(App, {
 *   title: 'My App',
 *   description: 'Built with vertz',
 *   og: { image: '/og.png' },
 *   scripts: ['/app.js'],
 *   styles: ['/app.css'],
 * })
 * ```
 */
export function renderPage(vnode: VNode, options?: PageOptions): Response {
  const status = options?.status ?? 200;
  const lang = options?.lang ?? 'en';

  // Build the <head> HTML from options
  const headHtml = buildHeadHtml(options ?? {});

  // Add raw head escape hatch if provided
  const fullHeadHtml = options?.head ? `${headHtml}\n${options.head}` : headHtml;

  // Build scripts HTML
  const scriptsHtml = options?.scripts
    ? '\n' +
      options.scripts.map((src) => `  <script type="module" src="${src}"></script>`).join('\n')
    : '';

  // Create a stream that emits the full HTML document
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Emit doctype and html opening
      controller.enqueue(encodeChunk('<!DOCTYPE html>\n'));
      controller.enqueue(encodeChunk(`<html lang="${lang}">\n`));

      // Emit head
      controller.enqueue(encodeChunk('<head>\n'));
      controller.enqueue(encodeChunk(fullHeadHtml));
      controller.enqueue(encodeChunk('\n</head>\n'));

      // Emit body opening
      controller.enqueue(encodeChunk('<body>\n'));

      // Stream the component content
      const componentStream = renderToStream(vnode);
      const reader = componentStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Emit scripts and body closing
      controller.enqueue(encodeChunk(scriptsHtml));
      controller.enqueue(encodeChunk('\n</body>\n'));
      controller.enqueue(encodeChunk('</html>'));

      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}
