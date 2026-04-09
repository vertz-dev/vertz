import { describe, expect, it } from '@vertz/test';
import type { SidebarTab } from '../config/types';
import { resolveRoutes } from '../routing/resolve';

const sidebar: SidebarTab[] = [
  {
    tab: 'Guides',
    groups: [
      {
        title: 'Getting Started',
        pages: ['index.mdx', 'quickstart.mdx'],
      },
      {
        title: 'Advanced',
        pages: ['guides/advanced.mdx', 'guides/deployment.mdx'],
      },
    ],
  },
  {
    tab: 'API',
    groups: [
      {
        title: 'Reference',
        pages: ['api/overview.mdx', 'api/endpoints.mdx'],
      },
    ],
  },
];

describe('resolveRoutes', () => {
  it('produces a flat list of page routes from sidebar config', () => {
    const routes = resolveRoutes(sidebar);
    expect(routes).toHaveLength(6);
  });

  it('derives URL path from file path (strips .mdx, index becomes /)', () => {
    const routes = resolveRoutes(sidebar);
    expect(routes[0]?.path).toBe('/');
    expect(routes[1]?.path).toBe('/quickstart');
    expect(routes[2]?.path).toBe('/guides/advanced');
  });

  it('includes tab and group metadata on each route', () => {
    const routes = resolveRoutes(sidebar);
    expect(routes[0]?.tab).toBe('Guides');
    expect(routes[0]?.group).toBe('Getting Started');
    expect(routes[4]?.tab).toBe('API');
    expect(routes[4]?.group).toBe('Reference');
  });

  it('includes the source file path on each route', () => {
    const routes = resolveRoutes(sidebar);
    expect(routes[0]?.filePath).toBe('index.mdx');
    expect(routes[2]?.filePath).toBe('guides/advanced.mdx');
  });

  it('computes prev/next links for navigation', () => {
    const routes = resolveRoutes(sidebar);
    expect(routes[0]?.prev).toBeUndefined();
    expect(routes[0]?.next?.path).toBe('/quickstart');
    expect(routes[1]?.prev?.path).toBe('/');
    expect(routes[1]?.next?.path).toBe('/guides/advanced');
    expect(routes[5]?.next).toBeUndefined();
  });

  it('derives a title from the file name when no frontmatter is available', () => {
    const routes = resolveRoutes(sidebar);
    expect(routes[0]?.title).toBe('Index');
    expect(routes[1]?.title).toBe('Quickstart');
    expect(routes[2]?.title).toBe('Advanced');
  });

  it('computes breadcrumbs from file path segments', () => {
    const routes = resolveRoutes(sidebar);
    expect(routes[0]?.breadcrumbs).toEqual([{ label: 'Index', path: '/' }]);
    expect(routes[2]?.breadcrumbs).toEqual([
      { label: 'Guides', path: '/guides' },
      { label: 'Advanced', path: '/guides/advanced' },
    ]);
  });

  it('returns empty array for empty sidebar', () => {
    const routes = resolveRoutes([]);
    expect(routes).toEqual([]);
  });
});
