import type { DocsConfig, SidebarTab } from '../config/types';
import type { TocHeading } from '../mdx/extract-headings';
import type { PageRoute } from '../routing/resolve';
import { filePathToTitle, filePathToUrlPath } from '../routing/resolve';
import { escapeHtml } from './escape-html';

export interface RenderPageOptions {
  config: DocsConfig;
  route: PageRoute;
  contentHtml: string;
  headings: TocHeading[];
}

function renderSidebar(sidebar: SidebarTab[], activePath: string): string {
  let html = '';
  for (const tab of sidebar) {
    for (const group of tab.groups) {
      html += `<div data-sidebar-group style="margin-bottom:16px">`;
      html += `<div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--docs-muted,#9ca3af);padding:4px 12px;margin-bottom:4px">${escapeHtml(group.title)}</div>`;
      for (const page of group.pages) {
        const path = filePathToUrlPath(page);
        const title = filePathToTitle(page);
        const isActive = path === activePath;
        const activeStyle = isActive
          ? 'color:var(--docs-primary,#2563eb);background:var(--docs-primary-bg,#eff6ff);font-weight:500'
          : 'color:var(--docs-text,#374151);font-weight:400';
        html += `<a href="${escapeHtml(path)}" data-active="${isActive}" style="display:block;padding:4px 12px;font-size:14px;text-decoration:none;border-radius:4px;${activeStyle}">${escapeHtml(title)}</a>`;
      }
      html += '</div>';
    }
  }
  return html;
}

function renderBreadcrumbs(route: PageRoute): string {
  if (route.breadcrumbs.length === 0) return '';
  const items = route.breadcrumbs
    .map(
      (b) =>
        `<a href="${escapeHtml(b.path)}" style="color:var(--docs-muted,#6b7280);text-decoration:none;font-size:14px">${escapeHtml(b.label)}</a>`,
    )
    .join('<span style="margin:0 8px;color:var(--docs-muted,#d1d5db)">/</span>');
  return `<nav data-breadcrumbs style="margin-bottom:16px">${items}</nav>`;
}

function renderToC(headings: TocHeading[]): string {
  if (headings.length === 0) return '';
  let html =
    '<nav data-toc style="position:sticky;top:72px"><div style="font-size:12px;font-weight:600;text-transform:uppercase;color:var(--docs-muted,#9ca3af);margin-bottom:8px">On this page</div>';
  for (const h of headings) {
    const indent = (h.depth - 2) * 12;
    html += `<a href="#${escapeHtml(h.slug)}" style="display:block;padding:2px 0;padding-left:${indent}px;font-size:13px;color:var(--docs-text,#6b7280);text-decoration:none">${escapeHtml(h.text)}</a>`;
  }
  html += '</nav>';
  return html;
}

function renderPrevNext(route: PageRoute): string {
  let html =
    '<nav data-prev-next style="display:flex;justify-content:space-between;margin-top:48px;padding-top:24px;border-top:1px solid var(--docs-border,#e5e7eb)">';
  if (route.prev) {
    html += `<a href="${escapeHtml(route.prev.path)}" style="text-decoration:none;color:var(--docs-primary,#2563eb)"><span style="font-size:12px;color:var(--docs-muted,#9ca3af)">Previous</span><br/>${escapeHtml(route.prev.title)}</a>`;
  } else {
    html += '<span></span>';
  }
  if (route.next) {
    html += `<a href="${escapeHtml(route.next.path)}" style="text-decoration:none;color:var(--docs-primary,#2563eb);text-align:right"><span style="font-size:12px;color:var(--docs-muted,#9ca3af)">Next</span><br/>${escapeHtml(route.next.title)}</a>`;
  }
  html += '</nav>';
  return html;
}

function renderHeader(config: DocsConfig): string {
  let linksHtml = '';
  if (config.navbar?.links) {
    linksHtml = config.navbar.links
      .map(
        (link) =>
          `<a href="${escapeHtml(link.href)}" style="font-size:14px;text-decoration:none;color:var(--docs-text,#374151)">${escapeHtml(link.label)}</a>`,
      )
      .join('');
  }
  let ctaHtml = '';
  if (config.navbar?.cta) {
    ctaHtml = `<a href="${escapeHtml(config.navbar.cta.href)}" style="font-size:14px;font-weight:500;text-decoration:none;padding:6px 16px;border-radius:6px;color:white;background:var(--docs-primary,#2563eb)">${escapeHtml(config.navbar.cta.label)}</a>`;
  }
  let searchHtml = '';
  if (config.search?.enabled) {
    searchHtml = `<button data-search style="display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--docs-border,#e5e7eb);border-radius:6px;background:var(--docs-bg,#ffffff);color:var(--docs-muted,#9ca3af);font-size:14px;cursor:pointer">Search<kbd style="font-size:11px;padding:2px 6px;border:1px solid var(--docs-border,#e5e7eb);border-radius:4px;background:var(--docs-bg,#f9fafb)">Cmd+K</kbd></button>`;
  }
  return `<header style="position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:0 24px;height:56px;border-bottom:1px solid var(--docs-border,#e5e7eb);background:var(--docs-bg,#ffffff)"><div style="display:flex;align-items:center;gap:24px"><a href="/" style="font-size:18px;font-weight:700;text-decoration:none;color:var(--docs-text,#111827)">${escapeHtml(config.name)}</a><nav style="display:flex;gap:16px">${linksHtml}</nav></div><div style="display:flex;align-items:center;gap:12px">${searchHtml}${ctaHtml}</div></header>`;
}

const LIVE_RELOAD_SCRIPT = `<script>
(function() {
  var es = new EventSource('/__docs_reload');
  es.onmessage = function() { location.reload(); };
  es.onerror = function() { es.close(); };
})();
</script>`;

const BASE_STYLES = `<style>
:root {
  --docs-bg: #ffffff;
  --docs-text: #111827;
  --docs-muted: #6b7280;
  --docs-border: #e5e7eb;
  --docs-primary: #2563eb;
  --docs-primary-bg: #eff6ff;
}
[data-theme="dark"] {
  --docs-bg: #0f172a;
  --docs-text: #e2e8f0;
  --docs-muted: #94a3b8;
  --docs-border: #334155;
  --docs-primary: #60a5fa;
  --docs-primary-bg: #1e293b;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--docs-text); background: var(--docs-bg); }
.docs-layout { display: flex; min-height: calc(100vh - 56px); }
.docs-sidebar { width: 256px; border-right: 1px solid var(--docs-border); padding: 16px 0; position: sticky; top: 56px; height: calc(100vh - 56px); overflow-y: auto; }
.docs-main { flex: 1; max-width: 768px; padding: 32px 48px; }
.docs-toc { width: 220px; padding: 32px 16px; }
.docs-content h1 { font-size: 2em; font-weight: 700; margin-bottom: 16px; }
.docs-content h2 { font-size: 1.5em; font-weight: 600; margin-top: 32px; margin-bottom: 12px; }
.docs-content h3 { font-size: 1.25em; font-weight: 600; margin-top: 24px; margin-bottom: 8px; }
.docs-content p { line-height: 1.7; margin-bottom: 16px; }
.docs-content pre { background: var(--docs-primary-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin-bottom: 16px; }
.docs-content code { font-family: 'SF Mono', Monaco, Menlo, monospace; font-size: 0.9em; }
.docs-content ul, .docs-content ol { padding-left: 24px; margin-bottom: 16px; }
.docs-content li { line-height: 1.7; margin-bottom: 4px; }
.docs-content a { color: var(--docs-primary); text-decoration: none; }
.docs-content a:hover { text-decoration: underline; }
.docs-content blockquote { border-left: 3px solid var(--docs-primary); padding-left: 16px; margin-bottom: 16px; color: var(--docs-muted); }
</style>`;

/**
 * Render a full docs HTML page from config, route, content, and headings.
 */
export function renderPageHtml({
  config,
  route,
  contentHtml,
  headings,
}: RenderPageOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(route.title)} - ${escapeHtml(config.name)}</title>
${BASE_STYLES}
</head>
<body>
${renderHeader(config)}
<div class="docs-layout">
<aside class="docs-sidebar">${renderSidebar(config.sidebar, route.path)}</aside>
<main class="docs-main">
${renderBreadcrumbs(route)}
<article class="docs-content">${contentHtml}</article>
${renderPrevNext(route)}
</main>
<aside class="docs-toc">${renderToC(headings)}</aside>
</div>
${LIVE_RELOAD_SCRIPT}
</body>
</html>`;
}
