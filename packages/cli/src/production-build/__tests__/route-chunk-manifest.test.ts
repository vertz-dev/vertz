import { describe, expect, test } from '@vertz/test';
import { generateRouteChunkManifest } from '../route-chunk-manifest';

describe('generateRouteChunkManifest', () => {
  test('extracts route-to-chunk mapping from bundled entry', () => {
    // Simulates Bun's minified output for a simple route config
    const entryContent = `
      var routes = Q({
        "/": { component: () => import("./chunk-abc123.js").then((m) => ({ default: () => m.TaskListPage() })) },
        "/tasks/new": { component: () => import("./chunk-def456.js").then((m) => ({ default: () => m.CreateTaskPage() })) },
        "/tasks/:id": { component: () => import("./chunk-ghi789.js").then((m) => ({ default: () => m.TaskDetailPage() })) }
      });
    `;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    expect(manifest.routes).toEqual({
      '/': ['/assets/chunk-abc123.js'],
      '/tasks/new': ['/assets/chunk-def456.js'],
      '/tasks/:id': ['/assets/chunk-ghi789.js'],
    });
  });

  test('handles minified output without whitespace', () => {
    const entryContent = `Q({"/":{ component:()=>import("./chunk-a.js").then((m)=>({default:()=>m.Home()}))},"/about":{component:()=>import("./chunk-b.js").then((m)=>({default:()=>m.About()}))}})`;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    expect(manifest.routes).toEqual({
      '/': ['/assets/chunk-a.js'],
      '/about': ['/assets/chunk-b.js'],
    });
  });

  test('returns empty routes when no defineRoutes-like pattern found', () => {
    const entryContent = 'var x = 1; console.log("hello");';
    const manifest = generateRouteChunkManifest(entryContent, '/assets');
    expect(manifest.routes).toEqual({});
  });

  test('handles multiple route definitions in same file', () => {
    // Two separate route blocks in the same bundled entry
    const entryContent = `
      Q({"/": { component: () => import("./chunk-main.js").then((m) => ({ default: () => m.Home() })) }});
      Q({"/admin": { component: () => import("./chunk-admin.js").then((m) => ({ default: () => m.Admin() })) }});
    `;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    expect(manifest.routes['/']).toEqual(['/assets/chunk-main.js']);
    expect(manifest.routes['/admin']).toEqual(['/assets/chunk-admin.js']);
  });

  test('ignores routes without dynamic import (sync components)', () => {
    const entryContent = `
      Q({
        "/": { component: () => import("./chunk-a.js").then((m) => ({ default: () => m.Home() })) },
        "/about": { component: () => AboutPage() }
      });
    `;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    // Only the lazy route should appear
    expect(manifest.routes).toEqual({
      '/': ['/assets/chunk-a.js'],
    });
  });

  test('handles single-quoted route keys', () => {
    const entryContent = `
      Q({
        '/': { component: () => import("./chunk-a.js").then((m) => ({ default: () => m.Home() })) },
        '/users/:id': { component: () => import("./chunk-b.js").then((m) => ({ default: () => m.User() })) }
      });
    `;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    expect(manifest.routes['/']).toEqual(['/assets/chunk-a.js']);
    expect(manifest.routes['/users/:id']).toEqual(['/assets/chunk-b.js']);
  });

  test('deduplicates chunk paths when multiple routes share a chunk', () => {
    const entryContent = `
      Q({
        "/": { component: () => import("./chunk-shared.js").then((m) => ({ default: () => m.Home() })) },
        "/alt": { component: () => import("./chunk-shared.js").then((m) => ({ default: () => m.AltHome() })) }
      });
    `;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    expect(manifest.routes['/']).toEqual(['/assets/chunk-shared.js']);
    expect(manifest.routes['/alt']).toEqual(['/assets/chunk-shared.js']);
  });

  test('uses correct asset prefix', () => {
    const entryContent = `Q({"/":{ component:()=>import("./chunk-a.js").then((m)=>({default:()=>m.X()}))}})`;

    const manifest = generateRouteChunkManifest(entryContent, '/static/assets');

    expect(manifest.routes['/']).toEqual(['/static/assets/chunk-a.js']);
  });

  test('extracts nested routes with full-path keys', () => {
    // Simulates bundled output with nested children containing braces
    const entryContent = `
      Q({
        "/dashboard": {
          component: () => import("./chunk-layout.js").then((m) => ({ default: () => m.DashboardLayout() })),
          children: {
            "/settings": {
              component: () => import("./chunk-settings.js").then((m) => ({ default: () => m.SettingsPage() }))
            },
            "/profile": {
              component: () => import("./chunk-profile.js").then((m) => ({ default: () => m.ProfilePage() }))
            }
          }
        }
      });
    `;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    expect(manifest.routes['/dashboard']).toEqual(['/assets/chunk-layout.js']);
    expect(manifest.routes['/dashboard/settings']).toEqual(['/assets/chunk-settings.js']);
    expect(manifest.routes['/dashboard/profile']).toEqual(['/assets/chunk-profile.js']);
  });

  test('avoids collision when same child key exists under different parents', () => {
    const entryContent = `
      Q({
        "/teams/:teamId": {
          component: () => import("./chunk-team-layout.js").then((m) => ({ default: () => m.TeamLayout() })),
          children: {
            "/settings": {
              component: () => import("./chunk-team-settings.js").then((m) => ({ default: () => m.TeamSettings() }))
            }
          }
        },
        "/org/:orgId": {
          component: () => import("./chunk-org-layout.js").then((m) => ({ default: () => m.OrgLayout() })),
          children: {
            "/settings": {
              component: () => import("./chunk-org-settings.js").then((m) => ({ default: () => m.OrgSettings() }))
            }
          }
        }
      });
    `;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    expect(manifest.routes['/teams/:teamId']).toEqual(['/assets/chunk-team-layout.js']);
    expect(manifest.routes['/teams/:teamId/settings']).toEqual(['/assets/chunk-team-settings.js']);
    expect(manifest.routes['/org/:orgId']).toEqual(['/assets/chunk-org-layout.js']);
    expect(manifest.routes['/org/:orgId/settings']).toEqual(['/assets/chunk-org-settings.js']);
  });

  test('handles deeply nested routes (3 levels)', () => {
    const entryContent = `
      Q({
        "/app": {
          component: () => import("./chunk-app.js").then((m) => ({ default: () => m.AppLayout() })),
          children: {
            "/teams/:teamId": {
              component: () => import("./chunk-team.js").then((m) => ({ default: () => m.TeamLayout() })),
              children: {
                "/members": {
                  component: () => import("./chunk-members.js").then((m) => ({ default: () => m.MembersPage() }))
                }
              }
            }
          }
        }
      });
    `;

    const manifest = generateRouteChunkManifest(entryContent, '/assets');

    expect(manifest.routes['/app']).toEqual(['/assets/chunk-app.js']);
    expect(manifest.routes['/app/teams/:teamId']).toEqual(['/assets/chunk-team.js']);
    expect(manifest.routes['/app/teams/:teamId/members']).toEqual(['/assets/chunk-members.js']);
  });
});
