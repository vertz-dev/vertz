/**
 * Check if a pathname matches a nav href.
 * - exact: pathname === href
 * - prefix: pathname starts with href, handling "/" specially and ensuring
 *   "/projects" doesn't match "/projects-archive" (requires segment boundary).
 */
export function isPathActive(pathname: string, href: string, match: 'exact' | 'prefix'): boolean {
  if (match === 'exact') return pathname === href;
  // Root path only matches exactly to prevent matching all routes
  if (href === '/') return pathname === '/';
  // Prefix match: exact match or href followed by a '/' segment boundary
  return pathname === href || pathname.startsWith(href + '/');
}
