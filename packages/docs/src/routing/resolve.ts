import type { SidebarTab } from '../config/types';

/** A breadcrumb entry. */
export interface Breadcrumb {
  label: string;
  path: string;
}

/** A navigation link (prev/next). */
export interface NavLink {
  path: string;
  title: string;
}

/** A resolved page route with all metadata. */
export interface PageRoute {
  path: string;
  filePath: string;
  title: string;
  tab: string;
  group: string;
  breadcrumbs: Breadcrumb[];
  prev: NavLink | undefined;
  next: NavLink | undefined;
}

/**
 * Convert a sidebar MDX file path to a URL path.
 * - `index.mdx` → `/`
 * - `quickstart.mdx` → `/quickstart`
 * - `guides/advanced.mdx` → `/guides/advanced`
 */
export function filePathToUrlPath(filePath: string): string {
  const withoutExt = filePath.replace(/\.mdx$/, '');
  if (withoutExt === 'index') return '/';
  return `/${withoutExt}`;
}

/**
 * Derive a human-readable title from a file name.
 * `quickstart.mdx` → `Quickstart`
 * `getting-started` → `Getting Started`
 * `guides/advanced.mdx` → `Advanced`
 */
export function filePathToTitle(filePath: string): string {
  const basename = filePath.split('/').pop() ?? filePath;
  const withoutExt = basename.replace(/\.mdx$/, '');
  return withoutExt
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Compute breadcrumbs from a URL path.
 * `/guides/advanced` → [{ label: 'Guides', path: '/guides' }, { label: 'Advanced', path: '/guides/advanced' }]
 */
function computeBreadcrumbs(urlPath: string, title: string): Breadcrumb[] {
  if (urlPath === '/') return [{ label: title, path: '/' }];

  const segments = urlPath.split('/').filter(Boolean);
  return segments.map((segment, i) => {
    const path = `/${segments.slice(0, i + 1).join('/')}`;
    const label = segment.charAt(0).toUpperCase() + segment.slice(1);
    return { label, path };
  });
}

/**
 * Resolve sidebar config into a flat list of page routes with
 * breadcrumbs, prev/next navigation, tab/group metadata.
 */
export function resolveRoutes(sidebar: SidebarTab[]): PageRoute[] {
  const routes: PageRoute[] = [];

  for (const tab of sidebar) {
    for (const group of tab.groups) {
      for (const page of group.pages) {
        const urlPath = filePathToUrlPath(page);
        const title = filePathToTitle(page);
        routes.push({
          path: urlPath,
          filePath: page,
          title,
          tab: tab.tab,
          group: group.title,
          breadcrumbs: computeBreadcrumbs(urlPath, title),
          prev: undefined,
          next: undefined,
        });
      }
    }
  }

  // Wire up prev/next links
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    if (!route) continue;
    const prevRoute = routes[i - 1];
    const nextRoute = routes[i + 1];
    if (prevRoute) {
      route.prev = { path: prevRoute.path, title: prevRoute.title };
    }
    if (nextRoute) {
      route.next = { path: nextRoute.path, title: nextRoute.title };
    }
  }

  return routes;
}
