/**
 * Tests for SSR prefetch manifest manager — in-memory manifest for dev server.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { createPrefetchManifestManager } from '../ssr-prefetch-dev';

// Minimal virtual file system for testing
const ROUTER_SOURCE = `
import { defineRoutes } from '@vertz/ui';
import { ProjectsPage } from './pages/projects-page';
import { ProjectLayout } from './layouts/project-layout';
import { IssueListPage } from './pages/issue-list-page';

export const routes = defineRoutes({
  '/projects': { component: () => <ProjectsPage /> },
  '/projects/:projectId': {
    component: () => <ProjectLayout />,
    children: {
      '/issues': { component: () => <IssueListPage /> },
    },
  },
});
`;

const PROJECTS_PAGE_SOURCE = `
import { query } from '@vertz/ui';
import { api } from '../api';
export function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>{projects.data}</div>;
}
`;

const PROJECT_LAYOUT_SOURCE = `
import { query, useParams } from '@vertz/ui';
import { api } from '../api';
export function ProjectLayout() {
  const { projectId } = useParams();
  const project = query(api.projects.get(projectId));
  return <div>{project.data}</div>;
}
`;

const ISSUE_LIST_SOURCE = `
import { query, useParams } from '@vertz/ui';
import { api } from '../api';
export function IssueListPage() {
  const { projectId } = useParams();
  const issues = query(api.issues.list({ where: { projectId } }));
  return <div>{issues.data}</div>;
}
`;

const ROUTER_PATH = '/app/src/router.tsx';
let FILES: Record<string, string> = {};

function createTestManager() {
  return createPrefetchManifestManager({
    routerPath: ROUTER_PATH,
    readFile: (path) => FILES[path],
    resolveImport: (specifier, fromFile) => {
      if (specifier.startsWith('./')) {
        const dir = fromFile.substring(0, fromFile.lastIndexOf('/'));
        const resolved = `${dir}/${specifier.slice(2)}`;
        // Try .tsx then .ts
        if (FILES[`${resolved}.tsx`]) return `${resolved}.tsx`;
        if (FILES[`${resolved}.ts`]) return `${resolved}.ts`;
        if (FILES[resolved]) return resolved;
      }
      return undefined;
    },
  });
}

describe('Feature: Prefetch manifest manager', () => {
  beforeEach(() => {
    FILES = {
      [ROUTER_PATH]: ROUTER_SOURCE,
      '/app/src/pages/projects-page.tsx': PROJECTS_PAGE_SOURCE,
      '/app/src/layouts/project-layout.tsx': PROJECT_LAYOUT_SOURCE,
      '/app/src/pages/issue-list-page.tsx': ISSUE_LIST_SOURCE,
    };
  });

  describe('Given a new manager', () => {
    it('Then getSSRManifest() returns undefined before build', () => {
      const manager = createTestManager();
      expect(manager.getSSRManifest()).toBeUndefined();
    });

    it('Then getSnapshot() returns null manifest and zero counts', () => {
      const manager = createTestManager();
      const snapshot = manager.getSnapshot();
      expect(snapshot.manifest).toBeNull();
      expect(snapshot.rebuildCount).toBe(0);
      expect(snapshot.lastRebuildMs).toBeNull();
    });
  });

  describe('Given manager.build() is called', () => {
    it('Then getSSRManifest() returns a manifest with route patterns', () => {
      const manager = createTestManager();
      manager.build();

      const manifest = manager.getSSRManifest();
      expect(manifest).toBeDefined();
      expect(manifest!.routePatterns.length).toBeGreaterThan(0);
      expect(manifest!.routePatterns).toContain('/projects');
      expect(manifest!.routePatterns).toContain('/projects/:projectId');
      expect(manifest!.routePatterns).toContain('/projects/:projectId/issues');
    });

    it('Then getSnapshot() returns manifest with rebuild metadata', () => {
      const manager = createTestManager();
      manager.build();

      const snapshot = manager.getSnapshot();
      expect(snapshot.manifest).not.toBeNull();
      expect(snapshot.rebuildCount).toBe(1);
      expect(snapshot.lastRebuildMs).toBeGreaterThanOrEqual(0);
      expect(snapshot.lastRebuildAt).toBeDefined();
    });

    it('Then routes have extracted queries', () => {
      const manager = createTestManager();
      manager.build();

      const snapshot = manager.getSnapshot();
      const routes = snapshot.manifest!.routes;
      const projectsRoute = routes.find((r) => r.pattern === '/projects');
      expect(projectsRoute?.queries).toHaveLength(1);
      expect(projectsRoute?.queries[0]?.descriptorChain).toBe('api.projects.list');
    });

    it('Then getSSRManifest() includes routeEntries with query bindings', () => {
      const manager = createTestManager();
      manager.build();

      const manifest = manager.getSSRManifest();
      expect(manifest!.routeEntries).toBeDefined();
      expect(manifest!.routeEntries!['/projects']).toBeDefined();
      expect(manifest!.routeEntries!['/projects'].queries).toHaveLength(1);
      expect(manifest!.routeEntries!['/projects'].queries[0].descriptorChain).toBe(
        'api.projects.list',
      );
      expect(manifest!.routeEntries!['/projects'].queries[0].entity).toBe('projects');
      expect(manifest!.routeEntries!['/projects'].queries[0].operation).toBe('list');
    });

    it('Then routeEntries includes parameterized route with bindings', () => {
      const manager = createTestManager();
      manager.build();

      const manifest = manager.getSSRManifest();
      const layoutEntry = manifest!.routeEntries!['/projects/:projectId'];
      expect(layoutEntry).toBeDefined();
      // Layout has api.projects.get(projectId)
      const getQuery = layoutEntry.queries.find((q) => q.descriptorChain === 'api.projects.get');
      expect(getQuery).toBeDefined();
      expect(getQuery!.entity).toBe('projects');
      expect(getQuery!.operation).toBe('get');
      expect(getQuery!.idParam).toBe('projectId');
    });
  });

  describe('Given a component file is saved', () => {
    let manager: ReturnType<typeof createPrefetchManifestManager>;

    beforeEach(() => {
      manager = createTestManager();
      manager.build();
    });

    it('Then onFileChange() incrementally updates that component queries', () => {
      // Modify the projects page to add a second query
      const updatedSource = `
import { query } from '@vertz/ui';
import { api } from '../api';
export function ProjectsPage() {
  const projects = query(api.projects.list());
  const count = query(api.projectStats.get());
  return <div>{projects.data}{count.data}</div>;
}
`;
      manager.onFileChange('/app/src/pages/projects-page.tsx', updatedSource);

      const snapshot = manager.getSnapshot();
      const route = snapshot.manifest!.routes.find((r) => r.pattern === '/projects');
      expect(route?.queries).toHaveLength(2);
      expect(snapshot.rebuildCount).toBe(2);
    });

    it('Then routes for other components are unchanged', () => {
      const snapshotBefore = manager.getSnapshot();
      const issuesBefore = snapshotBefore.manifest!.routes.find(
        (r) => r.pattern === '/projects/:projectId/issues',
      );

      manager.onFileChange('/app/src/pages/projects-page.tsx', PROJECTS_PAGE_SOURCE);

      const snapshotAfter = manager.getSnapshot();
      const issuesAfter = snapshotAfter.manifest!.routes.find(
        (r) => r.pattern === '/projects/:projectId/issues',
      );
      expect(issuesAfter?.queries).toEqual(issuesBefore?.queries);
    });

    it('Then updates ALL routes when a file maps to multiple routes', () => {
      // Set up a router where one component is used by two routes
      FILES[ROUTER_PATH] = `
import { defineRoutes } from '@vertz/ui';
import { ProjectsPage } from './pages/projects-page';

export const routes = defineRoutes({
  '/projects': { component: () => <ProjectsPage /> },
  '/favorites': { component: () => <ProjectsPage /> },
});
`;

      const multiManager = createTestManager();
      multiManager.build();

      const updatedSource = `
import { query } from '@vertz/ui';
import { api } from '../api';
export function ProjectsPage() {
  const projects = query(api.projects.list());
  const favorites = query(api.favorites.list());
  return <div>{projects.data}{favorites.data}</div>;
}
`;
      multiManager.onFileChange('/app/src/pages/projects-page.tsx', updatedSource);

      const snapshot = multiManager.getSnapshot();
      const projectsRoute = snapshot.manifest!.routes.find((r) => r.pattern === '/projects');
      const favoritesRoute = snapshot.manifest!.routes.find((r) => r.pattern === '/favorites');
      expect(projectsRoute?.queries).toHaveLength(2);
      expect(favoritesRoute?.queries).toHaveLength(2);
    });
  });

  describe('Given the router file is saved', () => {
    it('Then a full rebuild is triggered', () => {
      const manager = createTestManager();
      manager.build();

      // Change the router to add a new route
      const updatedRouter = `
import { defineRoutes } from '@vertz/ui';
import { ProjectsPage } from './pages/projects-page';
import { ProjectLayout } from './layouts/project-layout';
import { IssueListPage } from './pages/issue-list-page';

export const routes = defineRoutes({
  '/projects': { component: () => <ProjectsPage /> },
  '/projects/:projectId': {
    component: () => <ProjectLayout />,
    children: {
      '/issues': { component: () => <IssueListPage /> },
    },
  },
  '/settings': { component: () => <ProjectsPage /> },
});
`;
      // Update the virtual FS so readFile returns updated content
      FILES[ROUTER_PATH] = updatedRouter;
      manager.onFileChange(ROUTER_PATH, updatedRouter);

      const manifest = manager.getSSRManifest();
      expect(manifest!.routePatterns).toContain('/settings');
    });
  });

  describe('Given a non-component file is saved', () => {
    it('Then onFileChange() for an unknown file is a no-op', () => {
      const manager = createTestManager();
      manager.build();

      const countBefore = manager.getSnapshot().rebuildCount;
      manager.onFileChange('/app/src/utils/helpers.ts', 'export const x = 1;');

      expect(manager.getSnapshot().rebuildCount).toBe(countBefore);
    });
  });

  describe('Given concurrent reads during update', () => {
    it('Then getSSRManifest() always returns a complete manifest (atomic reference)', () => {
      const manager = createTestManager();
      manager.build();

      // Read before update
      const before = manager.getSSRManifest();
      expect(before).toBeDefined();

      // Update
      manager.onFileChange('/app/src/pages/projects-page.tsx', PROJECTS_PAGE_SOURCE);

      // Read after update
      const after = manager.getSSRManifest();
      expect(after).toBeDefined();

      // Both should be valid manifests
      expect(before!.routePatterns.length).toBeGreaterThan(0);
      expect(after!.routePatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Given build fails', () => {
    it('Then getSSRManifest() returns undefined (graceful degradation)', () => {
      const manager = createPrefetchManifestManager({
        routerPath: '/nonexistent/router.ts',
        readFile: () => undefined,
        resolveImport: () => undefined,
      });

      manager.build();
      // Should not throw, should gracefully degrade
      expect(manager.getSSRManifest()).toBeUndefined();
    });
  });
});
