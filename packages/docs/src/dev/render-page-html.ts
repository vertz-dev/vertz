import { Banner } from '../components/banner';
import type { DocsConfig, SidebarTab } from '../config/types';
import type { TocHeading } from '../mdx/extract-headings';
import type { PageRoute } from '../routing/resolve';
import { filePathToTitle, filePathToUrlPath } from '../routing/resolve';
import {
  SEARCH_PALETTE_HTML,
  SEARCH_PALETTE_SCRIPT,
  SEARCH_PALETTE_STYLES,
} from '../search/search-palette-script';
import { renderAnalyticsScript, renderHeadTags } from '../ssg/head-injection';
import { escapeHtml } from './escape-html';

export interface RenderPageOptions {
  config: DocsConfig;
  route: PageRoute;
  contentHtml: string;
  headings: TocHeading[];
  /** Set to false to omit the live reload script (e.g. for production SSG builds). */
  liveReload?: boolean;
  /** If true, page is excluded from search index via data-pagefind-ignore. */
  hidden?: boolean;
  /** If true, adds robots noindex meta tag. */
  noindex?: boolean;
  /** Frontmatter description for the page hero. */
  description?: string;
  /** Frontmatter title (overrides filename-derived title in hero). */
  pageTitle?: string;
  /** Map of filePath → frontmatter title for sidebar display. */
  pageTitles?: Record<string, string>;
}

function getPageTitle(page: string, pageTitles?: Record<string, string>): string {
  if (pageTitles) {
    const t = pageTitles[page] ?? pageTitles[`${page}.mdx`];
    if (t) return t;
  }
  return filePathToTitle(page);
}

const GITHUB_SVG =
  '<svg class="sidebar-ext-icon" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="currentColor"/></svg>';

function renderSidebarGithubLink(config: DocsConfig): string {
  const githubUrl = config.footer?.socials?.github;
  if (!githubUrl) return '';
  const href = escapeHtml(githubUrl);
  return (
    '<ul class="sidebar-external-links"><li><a href="' +
    href +
    '" class="sidebar-ext-link" target="_blank" rel="noopener">' +
    GITHUB_SVG +
    'GitHub</a></li></ul>'
  );
}

function renderSidebar(
  sidebar: SidebarTab[],
  activePath: string,
  activeTab: string,
  pageTitles?: Record<string, string>,
): string {
  let html = '';
  for (const tab of sidebar) {
    if (tab.tab !== activeTab) continue;
    for (const group of tab.groups) {
      html += '<div data-sidebar-group>';
      html += `<div class="sidebar-group-title">${escapeHtml(group.title)}</div>`;
      html += '<ul class="sidebar-links">';
      for (const page of group.pages) {
        const path = filePathToUrlPath(page);
        const title = getPageTitle(page, pageTitles);
        const isActive = path === activePath;
        html += `<li><a href="${escapeHtml(path)}" data-active="${isActive}" class="${isActive ? 'active' : ''}">${escapeHtml(title)}</a></li>`;
      }
      html += '</ul></div>';
    }
  }
  return html;
}

function renderToC(headings: TocHeading[]): string {
  if (headings.length === 0) return '';
  let html =
    '<nav data-toc class="docs-toc-nav"><div class="toc-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>On this page</div>';
  for (const h of headings) {
    const isSubHeading = h.depth > 2;
    const cls = isSubHeading ? ' class="toc-sub"' : '';
    html += `<a href="#${escapeHtml(h.slug)}"${cls}>${escapeHtml(h.text)}</a>`;
  }
  html += '</nav>';
  return html;
}

function renderPrevNext(route: PageRoute): string {
  let html = '<nav data-prev-next class="docs-prev-next">';
  if (route.prev) {
    html += `<a href="${escapeHtml(route.prev.path)}" class="prev-next-link"><span class="prev-next-label">Previous</span><span class="prev-next-title">${escapeHtml(route.prev.title)}</span></a>`;
  } else {
    html += '<span></span>';
  }
  if (route.next) {
    html += `<a href="${escapeHtml(route.next.path)}" class="prev-next-link next"><span class="prev-next-label">Next</span><span class="prev-next-title">${escapeHtml(route.next.title)}</span></a>`;
  }
  html += '</nav>';
  return html;
}

function renderTabBar(sidebar: SidebarTab[], activeTab: string): string {
  if (sidebar.length <= 1) return '';
  let html = '<div class="docs-tab-bar-wrapper"><div class="docs-tab-bar" data-tab-bar>';
  for (const tab of sidebar) {
    const firstPage = tab.groups[0]?.pages[0];
    const href = firstPage ? filePathToUrlPath(firstPage) : '/';
    const isActive = tab.tab === activeTab;
    html += `<a href="${escapeHtml(href)}" class="tab-link${isActive ? ' active' : ''}">${escapeHtml(tab.tab)}</a>`;
  }
  html += '</div></div>';
  return html;
}

function renderHeader(config: DocsConfig): string {
  let linksHtml = '';
  if (config.navbar?.links) {
    linksHtml = config.navbar.links
      .map(
        (link) =>
          `<a href="${escapeHtml(link.href)}" class="header-link">${escapeHtml(link.label)}</a>`,
      )
      .join('');
  }
  let ctaHtml = '';
  if (config.navbar?.cta) {
    ctaHtml = `<a href="${escapeHtml(config.navbar.cta.href)}" class="header-cta">${escapeHtml(config.navbar.cta.label)}</a>`;
  }
  let searchHtml = '';
  if (config.search?.enabled) {
    searchHtml = `<button data-search class="header-search"><svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 6.5C10 8.433 8.433 10 6.5 10C4.567 10 3 8.433 3 6.5C3 4.567 4.567 3 6.5 3C8.433 3 10 4.567 10 6.5ZM9.244 10.148C8.471 10.691 7.523 11 6.5 11C3.739 11 1.5 8.761 1.5 6C1.5 3.239 3.739 1 6.5 1C9.261 1 11.5 3.239 11.5 6C11.5 7.525 10.81 8.893 9.713 9.805L13.354 13.446L12.646 14.154L9.005 10.513L9.244 10.148Z" fill="currentColor"/></svg><span>Search...</span><kbd>\u2318K</kbd></button>`;
  }
  let brandHtml: string;
  if (config.logo) {
    brandHtml = `<img src="${escapeHtml(config.logo.light)}" alt="${escapeHtml(config.name)}" class="header-logo header-logo-light" /><img src="${escapeHtml(config.logo.dark)}" alt="${escapeHtml(config.name)}" class="header-logo header-logo-dark" />`;
  } else {
    brandHtml = escapeHtml(config.name);
  }
  const darkToggle = `<button data-theme-toggle class="theme-toggle" aria-label="Toggle dark mode"><svg data-theme-icon="light" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg><svg data-theme-icon="dark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>`;
  return `<header class="docs-header"><div class="docs-header-inner"><div class="header-left"><a href="/" class="header-brand">${brandHtml}</a></div><div class="header-right">${searchHtml}${linksHtml}${ctaHtml}${darkToggle}</div></div></header>`;
}

function renderHero(route: PageRoute, pageTitle?: string, description?: string): string {
  const title = pageTitle ?? route.title;
  let html = '<div class="docs-hero">';
  if (route.group) {
    html += `<div class="hero-category">${escapeHtml(route.group)}</div>`;
  }
  html += `<h1 class="hero-title">${escapeHtml(title)}</h1>`;
  if (description) {
    html += `<p class="hero-description">${escapeHtml(description)}</p>`;
  }
  html += '</div>';
  return html;
}

const LIVE_RELOAD_SCRIPT = `<script>
(function() {
  var es = new EventSource('/__docs_reload');
  es.onmessage = function() { location.reload(); };
  es.onerror = function() { es.close(); };
})();
</script>`;

const DARK_MODE_SCRIPT = `<script>
(function() {
  var saved = null;
  try { saved = localStorage.getItem('docs-theme'); } catch(e) {}
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  var btn = document.querySelector('[data-theme-toggle]');
  if (btn) btn.addEventListener('click', function() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('docs-theme', next); } catch(e) {}
    updateIcons(next);
  });
  function updateIcons(theme) {
    var light = document.querySelector('[data-theme-icon="light"]');
    var dark = document.querySelector('[data-theme-icon="dark"]');
    if (light) light.style.display = theme === 'dark' ? 'none' : '';
    if (dark) dark.style.display = theme === 'dark' ? '' : 'none';
  }
  updateIcons(document.documentElement.getAttribute('data-theme') || 'light');
})();
</script>`;

const SPA_NAV_SCRIPT = `<script>
(function() {
  function isInternalLink(a) {
    if (!a.href || a.origin !== location.origin) return false;
    var href = a.getAttribute('href') || '';
    if (href.startsWith('#') || a.target || a.download) return false;
    return true;
  }

  async function navigate(url, pushState) {
    try {
      document.body.classList.add('spa-loading');
      var res = await fetch(url);
      if (!res.ok) { location.href = url; return; }
      var html = await res.text();
      var doc = new DOMParser().parseFromString(html, 'text/html');

      var pairs = [
        ['.docs-main', '.docs-main'],
        ['.docs-sidebar', '.docs-sidebar'],
        ['.docs-toc', '.docs-toc'],
        ['[data-tab-bar]', '[data-tab-bar]'],
      ];
      for (var i = 0; i < pairs.length; i++) {
        var cur = document.querySelector(pairs[i][0]);
        var next = doc.querySelector(pairs[i][1]);
        if (cur && next) cur.innerHTML = next.innerHTML;
      }

      document.title = doc.title;
      if (pushState !== false) history.pushState(null, '', url);
      window.scrollTo(0, 0);
    } catch(e) {
      location.href = url;
    } finally {
      document.body.classList.remove('spa-loading');
    }
  }

  document.addEventListener('click', function(e) {
    var a = e.target.closest('a');
    if (!a || !isInternalLink(a)) return;
    e.preventDefault();
    if (a.href !== location.href) navigate(a.href);
  });

  window.addEventListener('popstate', function() {
    navigate(location.href, false);
  });
})();
</script>`;

const BASE_STYLES = `<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --docs-bg: #ffffff;
  --docs-text: #181a1e;
  --docs-text-secondary: #404246;
  --docs-muted: #717377;
  --docs-border: #eff1f5;
  --docs-primary: #3b82f6;
  --docs-primary-bg: rgba(59,130,246,0.06);
  --docs-code-bg: rgba(239,241,245,0.5);
  --docs-header-height: 54px;
  --docs-tab-height: 44px;
  --docs-sidebar-width: 280px;
  --docs-content-max-width: 800px;
  --docs-toc-width: 264px;
}
[data-theme="dark"] {
  --docs-bg: #0f1117;
  --docs-text: #e2e8f0;
  --docs-text-secondary: #a0aec0;
  --docs-muted: #718096;
  --docs-border: #2d3748;
  --docs-primary: #60a5fa;
  --docs-primary-bg: rgba(96,165,250,0.1);
  --docs-code-bg: rgba(45,55,72,0.5);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: Inter, 'Inter Fallback', -apple-system, system-ui, sans-serif;
  font-size: 16px;
  line-height: 24px;
  color: var(--docs-text);
  background: var(--docs-bg);
  -webkit-font-smoothing: antialiased;
}

/* ---- Header ---- */
.docs-header {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--docs-border);
  background: var(--docs-bg);
}
.docs-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--docs-header-height);
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px;
}
.header-left { display: flex; align-items: center; gap: 24px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.header-brand { text-decoration: none; color: var(--docs-text); font-weight: 700; font-size: 18px; display: flex; align-items: center; }
.header-logo { height: 24px; }
.header-logo-dark { display: none; }
[data-theme="dark"] .header-logo-light { display: none; }
[data-theme="dark"] .header-logo-dark { display: inline; }
.header-link {
  font-size: 14px;
  text-decoration: none;
  color: var(--docs-muted);
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 6px;
  transition: color 0.15s;
}
.header-link:hover { color: var(--docs-text); }
.header-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--docs-border);
  border-radius: 10px;
  background: var(--docs-bg);
  color: var(--docs-muted);
  font-size: 14px;
  cursor: pointer;
  min-width: 200px;
  font-family: inherit;
}
.header-search:hover { border-color: var(--docs-muted); }
.header-search kbd {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--docs-border);
  border-radius: 4px;
  background: var(--docs-bg);
  font-family: inherit;
  margin-left: auto;
}
.header-search svg { flex-shrink: 0; }
.header-cta {
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  padding: 6px 16px;
  border-radius: 8px;
  color: white;
  background: var(--docs-primary);
  transition: opacity 0.15s;
}
.header-cta:hover { opacity: 0.9; }
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--docs-muted);
  cursor: pointer;
}
.theme-toggle:hover { color: var(--docs-text); background: var(--docs-code-bg); }

/* ---- Tab Bar ---- */
.docs-tab-bar-wrapper {
  border-bottom: 1px solid var(--docs-border);
  background: var(--docs-bg);
  position: sticky;
  top: var(--docs-header-height);
  z-index: 49;
}
.docs-tab-bar {
  display: flex;
  gap: 24px;
  height: var(--docs-tab-height);
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px;
}
.tab-link {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  color: var(--docs-muted);
  padding: 0 4px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.tab-link:hover { color: var(--docs-text); }
.tab-link.active { color: var(--docs-text); border-bottom-color: var(--docs-text); }

/* ---- Layout ---- */
.docs-layout {
  display: flex;
  max-width: 1440px;
  margin: 0 auto;
}

/* ---- Sidebar ---- */
.docs-sidebar {
  width: var(--docs-sidebar-width);
  flex-shrink: 0;
  padding: 16px 16px 32px;
  position: sticky;
  top: calc(var(--docs-header-height) + var(--docs-tab-height));
  height: calc(100vh - var(--docs-header-height) - var(--docs-tab-height));
  overflow-y: auto;
  scrollbar-width: thin;
}
.docs-sidebar::-webkit-scrollbar { width: 4px; }
.docs-sidebar::-webkit-scrollbar-thumb { background: var(--docs-border); border-radius: 2px; }

[data-sidebar-group] { margin-bottom: 0; }
.sidebar-group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--docs-text);
  padding: 0 0 0 16px;
  margin: 0 0 10px;
}
[data-sidebar-group] + [data-sidebar-group] .sidebar-group-title { margin-top: 24px; }
.sidebar-links {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sidebar-links li { margin-top: 1px; }
.sidebar-links li:first-child { margin-top: 0; }
.sidebar-links li a {
  display: block;
  padding: 6px 12px 6px 16px;
  font-size: 14px;
  font-weight: 400;
  text-decoration: none;
  color: var(--docs-text-secondary);
  border-radius: 12px;
  transition: color 0.15s, background 0.15s;
  line-height: 24px;
}
.sidebar-links li a:hover { color: var(--docs-text); background: var(--docs-code-bg); }
.sidebar-links li a.active {
  color: var(--docs-primary);
  font-weight: 400;
  background: var(--docs-primary-bg);
}

/* ---- Main Content ---- */
.docs-main {
  flex: 1;
  min-width: 0;
  max-width: var(--docs-content-max-width);
  padding: 40px 48px 80px;
}

/* ---- Hero ---- */
.docs-hero { margin-bottom: 32px; }
.hero-category {
  font-size: 14px;
  font-weight: 600;
  color: var(--docs-primary);
  margin-bottom: 4px;
}
.hero-title {
  font-size: 30px;
  font-weight: 700;
  line-height: 36px;
  letter-spacing: -0.75px;
  color: var(--docs-text);
  margin-bottom: 8px;
}
.hero-description {
  font-size: 18px;
  line-height: 28px;
  color: var(--docs-muted);
}

/* ---- Content Typography ---- */
.docs-content h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.75px; line-height: 36px; margin-bottom: 16px; }
.docs-content h2 { font-size: 24px; font-weight: 600; line-height: 32px; margin-top: 48px; margin-bottom: 16px; }
.docs-content h3 { font-size: 20px; font-weight: 600; line-height: 28px; margin-top: 32px; margin-bottom: 8px; }
.docs-content h4 { font-size: 16px; font-weight: 600; line-height: 24px; margin-top: 24px; margin-bottom: 8px; }
.docs-content p { font-size: 16px; line-height: 28px; color: var(--docs-text-secondary); margin-bottom: 16px; }
.docs-content pre { background: var(--docs-code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin-bottom: 16px; border: 1px solid var(--docs-border); }
.docs-content code {
  font-family: 'JetBrains Mono', 'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
}
.docs-content :not(pre) > code {
  background: var(--docs-code-bg);
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--docs-text);
}
.docs-content ul, .docs-content ol { padding-left: 24px; margin-bottom: 16px; }
.docs-content li { line-height: 28px; margin-bottom: 4px; color: var(--docs-text-secondary); }
.docs-content a { color: var(--docs-primary); text-decoration: none; }
.docs-content a:hover { text-decoration: underline; }
.docs-content blockquote {
  border-left: 3px solid var(--docs-primary);
  padding: 12px 16px;
  margin-bottom: 16px;
  color: var(--docs-text-secondary);
  background: var(--docs-primary-bg);
  border-radius: 0 8px 8px 0;
}
.docs-content img { max-width: 100%; border-radius: 8px; }

/* ---- Tables ---- */
.docs-content table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px; }
.docs-content th { text-align: left; padding: 8px 12px; font-weight: 600; border-bottom: 2px solid var(--docs-border); }
.docs-content td { padding: 8px 12px; border-bottom: 1px solid var(--docs-border); }
.docs-content tr:last-child td { border-bottom: none; }

/* ---- Sidebar External Links (GitHub) ---- */
.sidebar-external-links {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
}
.sidebar-ext-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--docs-text-secondary);
  text-decoration: none;
  border-radius: 12px;
  transition: color 0.15s, background 0.15s;
  line-height: 24px;
}
.sidebar-ext-link:hover { color: var(--docs-text); background: var(--docs-code-bg); }
.sidebar-ext-icon { width: 16px; height: 16px; flex-shrink: 0; }

/* ---- Table of Contents ---- */
.docs-toc {
  width: var(--docs-toc-width);
  flex-shrink: 0;
  padding: 0 0 0 40px;
}
.docs-toc-nav {
  position: sticky;
  top: calc(var(--docs-header-height) + var(--docs-tab-height) + 40px);
  padding-top: 40px;
}
.toc-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--docs-text-secondary);
  margin-bottom: 8px;
}
.toc-title svg { flex-shrink: 0; color: var(--docs-muted); }
.docs-toc-nav a {
  display: block;
  padding: 4px 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--docs-muted);
  text-decoration: none;
  line-height: 24px;
  transition: color 0.15s;
}
.docs-toc-nav a:hover { color: var(--docs-text); }
.docs-toc-nav a.toc-sub { padding-left: 16px; }

/* ---- Prev/Next ---- */
.docs-prev-next {
  display: flex;
  justify-content: space-between;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--docs-border);
}
.prev-next-link {
  text-decoration: none;
  color: var(--docs-primary);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.prev-next-link.next { text-align: right; margin-left: auto; }
.prev-next-label { font-size: 12px; color: var(--docs-muted); }
.prev-next-title { font-size: 14px; font-weight: 500; }
.prev-next-link:hover .prev-next-title { text-decoration: underline; }

/* ---- Footer ---- */
.docs-footer {
  border-top: 1px solid var(--docs-border);
  padding: 40px 24px;
  text-align: center;
  font-size: 13px;
  color: var(--docs-muted);
}

/* ---- SPA Loading ---- */
.spa-loading .docs-main { opacity: 0.6; transition: opacity 0.1s; }

/* ---- Tooltip ---- */
[data-tooltip]:hover > [data-tooltip-text],
[data-tooltip]:focus-within > [data-tooltip-text] { display: block !important; }

/* ---- Responsive ---- */
@media (max-width: 1100px) {
  .docs-toc { display: none; }
}
@media (max-width: 768px) {
  .docs-sidebar { display: none; }
  .docs-main { padding: 24px 16px 80px; }
  .docs-tab-bar { padding: 0 16px; gap: 16px; }
  .docs-header { padding: 0 16px; }
}
</style>`;

/**
 * Render a full docs HTML page from config, route, content, and headings.
 */
export function renderPageHtml({
  config,
  route,
  contentHtml,
  headings,
  liveReload = true,
  hidden = false,
  noindex = false,
  description,
  pageTitle,
  pageTitles,
}: RenderPageOptions): string {
  const reloadScript = liveReload ? LIVE_RELOAD_SCRIPT : '';
  const searchEnabled = config.search?.enabled === true;
  const searchStyles = searchEnabled ? SEARCH_PALETTE_STYLES : '';
  const searchHtml = searchEnabled ? SEARCH_PALETTE_HTML : '';
  const searchScript = searchEnabled ? SEARCH_PALETTE_SCRIPT : '';
  const noindexMeta = noindex ? '<meta name="robots" content="noindex" />\n' : '';
  const headTags = config.head?.length ? `\n${renderHeadTags(config.head)}` : '';
  const analyticsScript = config.analytics ? renderAnalyticsScript(config.analytics) : '';
  const bannerHtml = config.banner ? Banner({ ...config.banner }) : '';
  const pagefindIgnore = hidden ? ' data-pagefind-ignore' : '';
  const displayTitle = pageTitle ?? route.title;
  const hasTabBar = config.sidebar.length > 1;
  // If no tab bar, adjust sidebar sticky top
  const sidebarTopOverride = hasTabBar
    ? ''
    : '<style>.docs-sidebar { top: var(--docs-header-height); height: calc(100vh - var(--docs-header-height)); } .docs-toc-nav { top: calc(var(--docs-header-height) + 40px); }</style>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${noindexMeta}<title>${escapeHtml(displayTitle)} - ${escapeHtml(config.name)}</title>
${config.favicon ? `<link rel="icon" href="${escapeHtml(config.favicon)}" />\n` : ''}${BASE_STYLES}
${searchStyles}${sidebarTopOverride}${headTags}
${analyticsScript}
</head>
<body${pagefindIgnore}>
${bannerHtml}
${renderHeader(config)}
${renderTabBar(config.sidebar, route.tab)}
<div class="docs-layout">
<aside class="docs-sidebar">${renderSidebarGithubLink(config)}${renderSidebar(config.sidebar, route.path, route.tab, pageTitles)}</aside>
<main class="docs-main">
${renderHero(route, pageTitle, description)}
<article class="docs-content">${contentHtml}</article>
${renderPrevNext(route)}
</main>
<aside class="docs-toc">${renderToC(headings)}</aside>
</div>
<footer class="docs-footer">Built with Vertz</footer>
${searchHtml}
${searchScript}
${SPA_NAV_SCRIPT}
${DARK_MODE_SCRIPT}
${reloadScript}
</body>
</html>`;
}
