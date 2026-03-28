import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadDocsConfig } from '../config/load';
import { compileMdxToHtml } from '../dev/compile-mdx-html';
import { escapeHtml } from '../dev/escape-html';
import { renderPageHtml } from '../dev/render-page-html';
import type { TocHeading } from '../mdx/extract-headings';
import { extractHeadings } from '../mdx/extract-headings';
import { parseFrontmatter } from '../mdx/frontmatter';
import { mdxToMarkdown } from '../mdx/llm-markdown';
import type { PageRoute } from '../routing/resolve';
import { resolveRoutes } from '../routing/resolve';
import type { LlmPage } from './llm-index';
import { generateLlmsFullTxt, generateLlmsTxt } from './llm-index';

/** Options for the build pipeline. */
export interface BuildDocsOptions {
  projectDir: string;
  outDir: string;
  baseUrl?: string;
}

/** Route metadata in the output manifest. */
export interface ManifestRoute {
  path: string;
  title: string;
  filePath: string;
  tab: string;
  group: string;
  headings: TocHeading[];
}

/** The output manifest written to manifest.json. */
export interface BuildManifest {
  name: string;
  routes: ManifestRoute[];
}

/**
 * Build the docs site — generates LLM output, manifest, and page metadata.
 */
export async function buildDocs(options: BuildDocsOptions): Promise<BuildManifest> {
  const { projectDir, outDir, baseUrl = '' } = options;

  // Load config
  const config = await loadDocsConfig(projectDir);

  // Resolve routes
  const routes = resolveRoutes(config.sidebar);

  // Ensure output directory exists
  mkdirSync(outDir, { recursive: true });

  // Process each page
  const pagesDir = join(projectDir, 'pages');
  const manifestRoutes: ManifestRoute[] = [];
  const llmPages: LlmPage[] = [];

  for (const route of routes) {
    const normalizedFilePath = route.filePath.endsWith('.mdx')
      ? route.filePath
      : `${route.filePath}.mdx`;
    const filePath = join(pagesDir, normalizedFilePath);
    if (!existsSync(filePath)) continue;

    const rawContent = await Bun.file(filePath).text();
    const { data: frontmatter, content: bodyContent } = parseFrontmatter(rawContent);
    const headings = extractHeadings(bodyContent);
    const title = frontmatter.title ?? route.title;
    const description = frontmatter.description || undefined;

    manifestRoutes.push({
      path: route.path,
      title,
      filePath: route.filePath,
      tab: route.tab,
      group: route.group,
      headings,
    });

    // Generate static HTML
    const contentHtml = await compileMdxToHtml(rawContent);
    const routeWithTitle: PageRoute = { ...route, title };
    const pageHtml = renderPageHtml({
      config,
      route: routeWithTitle,
      contentHtml,
      headings,
      liveReload: false,
    });

    // Inject SEO meta tags if description is present
    const seoHtml = injectSeoMeta(pageHtml, { description, baseUrl, path: route.path });

    const htmlPath = toHtmlOutputPath(route.path, outDir);
    mkdirSync(dirname(htmlPath), { recursive: true });
    await Bun.write(htmlPath, seoHtml);

    // Generate LLM markdown with enriched frontmatter
    if (config.llm?.enabled && !isLlmExcluded(route.filePath, config.llm.exclude)) {
      const strippedMarkdown = mdxToMarkdown(rawContent);
      const markdown = enrichLlmFrontmatter(strippedMarkdown, {
        title,
        description,
        category: route.group,
        url: baseUrl ? `${baseUrl}${route.path}` : route.path,
      });
      llmPages.push({ path: route.path, title, markdown });

      const llmFilePath = toLlmOutputPath(route.path, outDir);
      mkdirSync(dirname(llmFilePath), { recursive: true });
      await Bun.write(llmFilePath, markdown);
    }
  }

  // Generate llms.txt and llms-full.txt
  if (config.llm?.enabled) {
    const llmConfig = config.llm;
    const includedRoutes = routes.filter((r) => !isLlmExcluded(r.filePath, llmConfig.exclude));
    const llmsTxt = generateLlmsTxt(includedRoutes, llmConfig, baseUrl);
    await Bun.write(join(outDir, 'llms.txt'), llmsTxt);

    const llmsFullTxt = generateLlmsFullTxt(llmPages, llmConfig);
    await Bun.write(join(outDir, 'llms-full.txt'), llmsFullTxt);
  }

  // Generate sitemap.xml
  if (baseUrl) {
    const sitemap = generateSitemap(manifestRoutes, baseUrl);
    await Bun.write(join(outDir, 'sitemap.xml'), sitemap);

    const robots = generateRobotsTxt(baseUrl);
    await Bun.write(join(outDir, 'robots.txt'), robots);
  }

  // Generate redirect pages
  if (config.redirects) {
    for (const redirect of config.redirects) {
      const redirectHtml = generateRedirectHtml(redirect.destination);
      const redirectPath = join(outDir, redirect.source, 'index.html');
      mkdirSync(dirname(redirectPath), { recursive: true });
      await Bun.write(redirectPath, redirectHtml);
    }
  }

  // Copy public/ directory to output
  const publicDir = join(projectDir, 'public');
  if (existsSync(publicDir)) {
    cpSync(publicDir, outDir, { recursive: true });
  }

  // Run Pagefind for search index (optional — only if search enabled and binary available)
  if (config.search?.enabled) {
    await runPagefind(outDir);
  }

  // Write manifest
  const manifest: BuildManifest = {
    name: config.name,
    routes: manifestRoutes,
  };
  await Bun.write(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return manifest;
}

/** Run Pagefind to generate the search index. Best-effort — skips if not installed. */
async function runPagefind(outDir: string): Promise<void> {
  try {
    const proc = Bun.spawn(['bunx', 'pagefind', '--site', outDir], {
      stdout: 'ignore',
      stderr: 'pipe',
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      // Pagefind not installed or failed — not a fatal error
      const stderr = await new Response(proc.stderr).text();
      console.warn(`[docs] Pagefind search indexing skipped: ${stderr.trim()}`);
    }
  } catch {
    // Binary not found — skip silently
  }
}

/** Check if a file path matches any of the LLM exclude patterns. */
function isLlmExcluded(filePath: string, exclude?: string[]): boolean {
  if (!exclude || exclude.length === 0) return false;
  // Strip .mdx extension for matching
  const bare = filePath.replace(/\.mdx$/, '');
  for (const pattern of exclude) {
    if (matchGlob(bare, pattern) || matchGlob(filePath, pattern)) {
      return true;
    }
  }
  return false;
}

/** Simple glob matching supporting * and **. */
function matchGlob(str: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\*\*/g, '<<DOUBLE>>')
    .replace(/\*/g, '<<SINGLE>>')
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/<<SINGLE>>/g, '[^/]*')
    .replace(/<<DOUBLE>>/g, '.*');
  return new RegExp(`^${regexStr}$`).test(str);
}

/** Enrich LLM markdown with frontmatter metadata from the build context. */
function enrichLlmFrontmatter(
  markdown: string,
  meta: { title: string; description?: string; category: string; url: string },
): string {
  // Strip existing frontmatter (mdxToMarkdown passes it through from source)
  const stripped = markdown.replace(/^---\n[\s\S]*?\n---\n*/, '');
  const lines: string[] = ['---', `title: ${meta.title}`];
  if (meta.description) lines.push(`description: ${meta.description}`);
  lines.push(`category: ${meta.category}`);
  lines.push(`url: ${meta.url}`);
  lines.push('---', '');
  return lines.join('\n') + stripped;
}

/** Convert a URL path to the LLM output file path. */
function toLlmOutputPath(urlPath: string, outDir: string): string {
  const fileName = urlPath === '/' ? 'home.md' : `${urlPath.slice(1)}.md`;
  return join(outDir, 'llms', fileName);
}

/** Convert a URL path to the static HTML output file path. */
function toHtmlOutputPath(urlPath: string, outDir: string): string {
  if (urlPath === '/') return join(outDir, 'index.html');
  return join(outDir, `${urlPath.slice(1)}.html`);
}

/** Inject SEO meta tags into the HTML <head>. */
function injectSeoMeta(
  html: string,
  opts: { description?: string; baseUrl: string; path: string },
): string {
  const metaTags: string[] = [];
  if (opts.description) {
    metaTags.push(`<meta name="description" content="${escapeHtml(opts.description)}" />`);
    metaTags.push(`<meta property="og:description" content="${escapeHtml(opts.description)}" />`);
  }
  if (opts.baseUrl) {
    const canonical = `${opts.baseUrl}${opts.path}`;
    metaTags.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  }
  if (metaTags.length === 0) return html;
  return html.replace('</head>', `${metaTags.join('\n')}\n</head>`);
}

/** Generate sitemap.xml for all routes. */
function generateSitemap(routes: ManifestRoute[], baseUrl: string): string {
  const urls = routes
    .map((r) => `  <url><loc>${escapeHtml(baseUrl)}${escapeHtml(r.path)}</loc></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** Generate robots.txt with sitemap reference. */
function generateRobotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}

/** Generate a redirect HTML page. */
function generateRedirectHtml(destination: string): string {
  const escaped = escapeHtml(destination);
  return `<!DOCTYPE html>\n<html><head><meta http-equiv="refresh" content="0;url=${escaped}" /><link rel="canonical" href="${escaped}" /></head><body><p>Redirecting to <a href="${escaped}">${escaped}</a>...</p></body></html>`;
}
