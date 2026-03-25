/**
 * Tests for prefetch manifest generation — static analysis of routes,
 * component imports, and query() calls for SSR single-pass prefetching.
 *
 * Phase 2 of SSR single-pass prefetch: build-time AST analysis produces
 * a manifest mapping route patterns → component files → query metadata.
 */
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  analyzeComponentQueries,
  collectImports,
  extractRoutes,
  generatePrefetchManifest,
} from '../prefetch-manifest';

// ─── Route Extraction ───────────────────────────────────────────

describe('Feature: Route extraction from defineRoutes()', () => {
  describe('Given a simple flat route definition', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';
      import { HomePage } from './pages/home-page';

      export const routes = defineRoutes({
        '/': { component: () => <HomePage /> },
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then it extracts the route pattern and component name', () => {
        const routes = extractRoutes(source, 'src/router.tsx');

        expect(routes).toHaveLength(1);
        expect(routes[0].pattern).toBe('/');
        expect(routes[0].componentName).toBe('HomePage');
        expect(routes[0].type).toBe('page');
      });
    });
  });

  describe('Given nested routes with children', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';
      import { Layout } from './components/layout';
      import { DashboardPage } from './pages/dashboard';
      import { SettingsPage } from './pages/settings';

      export const routes = defineRoutes({
        '/': {
          component: () => <Layout />,
          children: {
            '/dashboard': { component: () => <DashboardPage /> },
            '/settings': { component: () => <SettingsPage /> },
          },
        },
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then the parent is a layout and children are pages', () => {
        const routes = extractRoutes(source, 'src/router.tsx');

        expect(routes).toHaveLength(3);
        expect(routes[0]).toEqual({
          pattern: '/',
          componentName: 'Layout',
          type: 'layout',
        });
        expect(routes[1]).toEqual({
          pattern: '/dashboard',
          componentName: 'DashboardPage',
          type: 'page',
        });
        expect(routes[2]).toEqual({
          pattern: '/settings',
          componentName: 'SettingsPage',
          type: 'page',
        });
      });
    });
  });

  describe('Given deeply nested routes (linear clone pattern)', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';
      import { ProtectedRoute } from '@vertz/ui-auth';
      import { WorkspaceShell } from './components/auth-guard';
      import { ProjectLayout } from './components/project-layout';
      import { IssueDetailPage } from './pages/issue-detail-page';
      import { IssueListPage } from './pages/issue-list-page';
      import { LoginPage } from './pages/login-page';
      import { ProjectBoardPage } from './pages/project-board-page';
      import { ProjectsPage } from './pages/projects-page';

      function IndexRedirect() {
        return <div />;
      }

      export const routes = defineRoutes({
        '/login': {
          component: () => <LoginPage />,
        },
        '/': {
          component: () => (
            <ProtectedRoute>
              <WorkspaceShell />
            </ProtectedRoute>
          ),
          children: {
            '/': {
              component: () => <IndexRedirect />,
            },
            '/projects': {
              component: () => <ProjectsPage />,
            },
            '/projects/:projectId': {
              component: () => <ProjectLayout />,
              children: {
                '/': {
                  component: () => <IssueListPage />,
                },
                '/board': {
                  component: () => <ProjectBoardPage />,
                },
                '/issues/:issueId': {
                  component: () => <IssueDetailPage />,
                },
              },
            },
          },
        },
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then all routes are extracted with correct flattened patterns', () => {
        const routes = extractRoutes(source, 'src/router.tsx');
        const patterns = routes.map((r) => r.pattern);

        expect(patterns).toContain('/login');
        expect(patterns).toContain('/');
        expect(patterns).toContain('/projects');
        expect(patterns).toContain('/projects/:projectId');
        expect(patterns).toContain('/projects/:projectId/board');
        expect(patterns).toContain('/projects/:projectId/issues/:issueId');
      });

      it('Then layout vs page types are correct', () => {
        const routes = extractRoutes(source, 'src/router.tsx');
        const byPattern = (p: string) => routes.find((r) => r.pattern === p);

        // Root is layout (has children)
        expect(byPattern('/')?.type).toBe('layout');
        // Login is page (no children)
        expect(byPattern('/login')?.type).toBe('page');
        // ProjectLayout is layout (has children)
        expect(byPattern('/projects/:projectId')?.type).toBe('layout');
        // Leaf pages
        expect(byPattern('/projects')?.type).toBe('page');
        expect(byPattern('/projects/:projectId/board')?.type).toBe('page');
        expect(byPattern('/projects/:projectId/issues/:issueId')?.type).toBe('page');
      });

      it('Then component names are extracted correctly', () => {
        const routes = extractRoutes(source, 'src/router.tsx');
        const byPattern = (p: string) => routes.find((r) => r.pattern === p);

        expect(byPattern('/login')?.componentName).toBe('LoginPage');
        expect(byPattern('/')?.componentName).toBe('ProtectedRoute');
        expect(byPattern('/projects')?.componentName).toBe('ProjectsPage');
        expect(byPattern('/projects/:projectId')?.componentName).toBe('ProjectLayout');
        expect(byPattern('/projects/:projectId/board')?.componentName).toBe('ProjectBoardPage');
        expect(byPattern('/projects/:projectId/issues/:issueId')?.componentName).toBe(
          'IssueDetailPage',
        );
      });
    });
  });

  describe('Given a route with no component', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';

      export const routes = defineRoutes({
        '/api': {},
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then routes without components are excluded', () => {
        const routes = extractRoutes(source, 'src/router.tsx');
        expect(routes).toHaveLength(0);
      });
    });
  });

  describe('Given routes with dynamic imports', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';

      export const routes = defineRoutes({
        '/': { component: () => import('./pages/home') },
        '/games': { component: () => import('./pages/games-list') },
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then it extracts component names from dynamic import paths', () => {
        const routes = extractRoutes(source, 'src/router.ts');

        expect(routes).toHaveLength(2);
        expect(routes[0].pattern).toBe('/');
        expect(routes[0].componentName).toBe('Home');
        expect(routes[0].type).toBe('page');
      });

      it('Then it converts kebab-case import paths to PascalCase', () => {
        const routes = extractRoutes(source, 'src/router.ts');

        expect(routes[1].pattern).toBe('/games');
        expect(routes[1].componentName).toBe('GamesList');
      });
    });
  });

  describe('Given routes with function call components', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';
      import { HomePage } from './pages/home-page';

      export const routes = defineRoutes({
        '/': { component: () => HomePage() },
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then it extracts the component name from the function call', () => {
        const routes = extractRoutes(source, 'src/router.tsx');

        expect(routes).toHaveLength(1);
        expect(routes[0].pattern).toBe('/');
        expect(routes[0].componentName).toBe('HomePage');
        expect(routes[0].type).toBe('page');
      });
    });
  });

  describe('Given routes with arrow returning bare identifier', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';
      import { HomePage } from './pages/home-page';

      export const routes = defineRoutes({
        '/': { component: () => HomePage },
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then it extracts the component name from the arrow body identifier', () => {
        const routes = extractRoutes(source, 'src/router.tsx');

        expect(routes).toHaveLength(1);
        expect(routes[0].pattern).toBe('/');
        expect(routes[0].componentName).toBe('HomePage');
        expect(routes[0].type).toBe('page');
      });
    });
  });

  describe('Given routes with bare identifier (no arrow) components', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';
      import { HomePage } from './pages/home-page';

      export const routes = defineRoutes({
        '/': { component: HomePage },
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then it extracts the component name from the identifier', () => {
        const routes = extractRoutes(source, 'src/router.tsx');

        expect(routes).toHaveLength(1);
        expect(routes[0].pattern).toBe('/');
        expect(routes[0].componentName).toBe('HomePage');
        expect(routes[0].type).toBe('page');
      });
    });
  });

  describe('Given routes with snake_case dynamic import paths', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';

      export const routes = defineRoutes({
        '/': { component: () => import('./pages/home_page') },
      });
    `;

    describe('When extractRoutes() is called', () => {
      it('Then it converts snake_case to PascalCase', () => {
        const routes = extractRoutes(source, 'src/router.ts');

        expect(routes).toHaveLength(1);
        expect(routes[0].componentName).toBe('HomePage');
      });
    });
  });

  describe('Given no defineRoutes() call in the source', () => {
    const source = `
      import { createRouter } from '@vertz/ui';
      export const router = createRouter({});
    `;

    describe('When extractRoutes() is called', () => {
      it('Then returns an empty array', () => {
        const routes = extractRoutes(source, 'src/router.tsx');
        expect(routes).toHaveLength(0);
      });
    });
  });

  describe('Given the real linear clone router.tsx', () => {
    const linearRouterPath = resolve(import.meta.dir, '../../../../examples/linear/src/router.tsx');
    const source = readFileSync(linearRouterPath, 'utf-8');

    describe('When extractRoutes() is called on the real file', () => {
      it('Then all expected route patterns are extracted', () => {
        const routes = extractRoutes(source, linearRouterPath);
        const patterns = routes.map((r) => r.pattern);

        expect(patterns).toContain('/login');
        expect(patterns).toContain('/');
        expect(patterns).toContain('/projects');
        expect(patterns).toContain('/projects/:projectId');
        expect(patterns).toContain('/projects/:projectId/board');
        expect(patterns).toContain('/projects/:projectId/issues/:issueId');
      });
    });
  });
});

// ─── Query Binding Extraction ────────────────────────────────────

describe('Feature: Enhanced manifest with query bindings', () => {
  describe('Given query(api.projects.get(projectId)) where projectId from useParams()', () => {
    const source = `
      import { query, useParams } from '@vertz/ui';
      import { api } from '../api';

      export function ProjectLayout() {
        const { projectId } = useParams();
        const project = query(api.projects.get(projectId));
        return <div>{project.data}</div>;
      }
    `;

    it('Then has entity="projects", operation="get", idParam="projectId"', () => {
      const result = analyzeComponentQueries(source, 'src/layout.tsx');

      expect(result.queries).toHaveLength(1);
      expect(result.queries[0].entity).toBe('projects');
      expect(result.queries[0].operation).toBe('get');
      expect(result.queries[0].idParam).toBe('projectId');
    });
  });

  describe('Given query(api.issues.list({ where: { projectId }, select: { id: true, title: true } }))', () => {
    const source = `
      import { query, useParams } from '@vertz/ui';
      import { api } from '../api';

      export function IssueListPage() {
        const { projectId } = useParams();
        const issues = query(api.issues.list({ where: { projectId }, select: { id: true, title: true } }));
        return <div>{issues.data}</div>;
      }
    `;

    it('Then queryBindings.where = { projectId: "$projectId" }', () => {
      const result = analyzeComponentQueries(source, 'src/page.tsx');

      expect(result.queries).toHaveLength(1);
      expect(result.queries[0].queryBindings?.where).toEqual({ projectId: '$projectId' });
    });

    it('Then queryBindings.select = { id: true, title: true }', () => {
      const result = analyzeComponentQueries(source, 'src/page.tsx');

      expect(result.queries[0].queryBindings?.select).toEqual({ id: true, title: true });
    });
  });

  describe('Given query(api.projects.list()) with no arguments', () => {
    const source = `
      import { query } from '@vertz/ui';
      import { api } from '../api';

      export function ProjectsPage() {
        const projects = query(api.projects.list());
        return <div>{projects.data}</div>;
      }
    `;

    it('Then entity="projects", operation="list", queryBindings is undefined', () => {
      const result = analyzeComponentQueries(source, 'src/page.tsx');

      expect(result.queries).toHaveLength(1);
      expect(result.queries[0].entity).toBe('projects');
      expect(result.queries[0].operation).toBe('list');
      expect(result.queries[0].queryBindings).toBeUndefined();
    });
  });

  describe('Given query with non-param dynamic value in where clause', () => {
    const source = `
      import { query } from '@vertz/ui';
      import { api } from '../api';

      export function SearchPage() {
        let searchTerm = '';
        const results = query(api.issues.list({ where: { title: searchTerm } }));
        return <div>{results.data}</div>;
      }
    `;

    it('Then the where binding value is null (cannot bind statically)', () => {
      const result = analyzeComponentQueries(source, 'src/page.tsx');

      expect(result.queries).toHaveLength(1);
      // Non-param variables get null to indicate "dynamic, cannot resolve statically"
      expect(result.queries[0].queryBindings?.where).toEqual({ title: null });
    });
  });

  describe('Given query(api.issues.get(issueId, { select: { id: true } }))', () => {
    const source = `
      import { query, useParams } from '@vertz/ui';
      import { api } from '../api';

      export function IssueDetailPage() {
        const { issueId } = useParams();
        const issue = query(api.issues.get(issueId, { select: { id: true, title: true, description: true } }));
        return <div>{issue.data}</div>;
      }
    `;

    it('Then has idParam="issueId" and queryBindings.select', () => {
      const result = analyzeComponentQueries(source, 'src/page.tsx');

      expect(result.queries).toHaveLength(1);
      expect(result.queries[0].entity).toBe('issues');
      expect(result.queries[0].operation).toBe('get');
      expect(result.queries[0].idParam).toBe('issueId');
      expect(result.queries[0].queryBindings?.select).toEqual({
        id: true,
        title: true,
        description: true,
      });
    });
  });

  describe('Given query with orderBy and limit', () => {
    const source = `
      import { query, useParams } from '@vertz/ui';
      import { api } from '../api';

      export function RecentIssuesPage() {
        const { projectId } = useParams();
        const issues = query(api.issues.list({
          where: { projectId },
          orderBy: { createdAt: 'desc' },
          limit: 10,
        }));
        return <div>{issues.data}</div>;
      }
    `;

    it('Then queryBindings includes orderBy and limit', () => {
      const result = analyzeComponentQueries(source, 'src/page.tsx');

      expect(result.queries).toHaveLength(1);
      expect(result.queries[0].queryBindings?.where).toEqual({ projectId: '$projectId' });
      expect(result.queries[0].queryBindings?.orderBy).toEqual({ createdAt: 'desc' });
      expect(result.queries[0].queryBindings?.limit).toBe(10);
    });
  });
});

// ─── Component Query Extraction ─────────────────────────────────

describe('Feature: Component query extraction via AST', () => {
  describe('Given a component with a simple query(api.entity.list()) call', () => {
    const source = `
      import { query } from '@vertz/ui';
      import { api } from '../api';

      export function ProjectsPage() {
        const projects = query(api.projects.list());
        return <div>{projects.data}</div>;
      }
    `;

    describe('When analyzeComponentQueries() is called', () => {
      it('Then it extracts the descriptor factory chain (entity + method)', () => {
        const result = analyzeComponentQueries(source, 'src/pages/projects-page.tsx');

        expect(result.queries).toHaveLength(1);
        expect(result.queries[0].descriptorChain).toBe('api.projects.list');
      });
    });
  });

  describe('Given a component with query(api.entity.get(param))', () => {
    const source = `
      import { query, useParams } from '@vertz/ui';
      import { api } from '../api';

      export function IssueDetailPage() {
        const { issueId } = useParams<'/projects/:projectId/issues/:issueId'>();
        const issue = query(api.issues.get(issueId));
        return <div>{issue.data}</div>;
      }
    `;

    describe('When analyzeComponentQueries() is called', () => {
      it('Then it extracts the descriptor chain and detects useParams', () => {
        const result = analyzeComponentQueries(source, 'src/pages/issue-detail.tsx');

        expect(result.queries).toHaveLength(1);
        expect(result.queries[0].descriptorChain).toBe('api.issues.get');
      });

      it('Then it detects useParams destructured params', () => {
        const result = analyzeComponentQueries(source, 'src/pages/issue-detail.tsx');

        expect(result.params).toEqual(['issueId']);
      });
    });
  });

  describe('Given a component with query(api.entity.list({ where: {...} }))', () => {
    const source = `
      import { query, useParams } from '@vertz/ui';
      import { api } from '../api';

      export function IssueListPage() {
        const { projectId } = useParams<'/projects/:projectId'>();
        const issues = query(api.issues.list({
          where: { projectId },
          select: { id: true, title: true },
        }));
        const labels = query(api.labels.list({ where: { projectId } }));
        return <div>{issues.data}{labels.data}</div>;
      }
    `;

    describe('When analyzeComponentQueries() is called', () => {
      it('Then it extracts all query descriptor chains', () => {
        const result = analyzeComponentQueries(source, 'src/pages/issue-list.tsx');

        expect(result.queries).toHaveLength(2);
        const chains = result.queries.map((q) => q.descriptorChain);
        expect(chains).toContain('api.issues.list');
        expect(chains).toContain('api.labels.list');
      });

      it('Then it detects route params from useParams', () => {
        const result = analyzeComponentQueries(source, 'src/pages/issue-list.tsx');
        expect(result.params).toEqual(['projectId']);
      });
    });
  });

  describe('Given a component with no query() calls', () => {
    const source = `
      export function StaticPage() {
        return <div>Hello world</div>;
      }
    `;

    describe('When analyzeComponentQueries() is called', () => {
      it('Then queries is empty', () => {
        const result = analyzeComponentQueries(source, 'src/pages/static.tsx');
        expect(result.queries).toHaveLength(0);
        expect(result.params).toHaveLength(0);
      });
    });
  });

  describe('Given a component with multiple useParams destructured fields', () => {
    const source = `
      import { query, useParams } from '@vertz/ui';
      import { api } from '../api';

      export function IssueDetailPage() {
        const { projectId, issueId } = useParams<'/projects/:projectId/issues/:issueId'>();
        const issue = query(api.issues.get(issueId, { include: { labels: true } }));
        const labels = query(api.labels.list({ where: { projectId } }));
        const issueLabels = query(api.issueLabels.list({ where: { issueId } }));
        return <div>{issue.data}</div>;
      }
    `;

    describe('When analyzeComponentQueries() is called', () => {
      it('Then all params are detected', () => {
        const result = analyzeComponentQueries(source, 'src/pages/issue-detail.tsx');
        expect(result.params).toContain('projectId');
        expect(result.params).toContain('issueId');
      });

      it('Then all queries are extracted', () => {
        const result = analyzeComponentQueries(source, 'src/pages/issue-detail.tsx');
        expect(result.queries).toHaveLength(3);
        const chains = result.queries.map((q) => q.descriptorChain);
        expect(chains).toContain('api.issues.get');
        expect(chains).toContain('api.labels.list');
        expect(chains).toContain('api.issueLabels.list');
      });
    });
  });
});

// ─── Import Collection ──────────────────────────────────────────

describe('Feature: Import collection from source files', () => {
  describe('Given a router file with named imports', () => {
    const source = `
      import { defineRoutes } from '@vertz/ui';
      import { ProtectedRoute } from '@vertz/ui-auth';
      import { ProjectLayout } from './components/project-layout';
      import { ProjectsPage } from './pages/projects-page';
    `;

    describe('When collectImports() is called', () => {
      it('Then it returns all named imports with source paths', () => {
        const imports = collectImports(source, 'src/router.tsx');

        expect(imports).toContainEqual({
          localName: 'ProjectLayout',
          originalName: 'ProjectLayout',
          source: './components/project-layout',
        });
        expect(imports).toContainEqual({
          localName: 'ProjectsPage',
          originalName: 'ProjectsPage',
          source: './pages/projects-page',
        });
      });
    });
  });
});

// ─── Full Manifest Generation ───────────────────────────────────

describe('Feature: Full prefetch manifest generation', () => {
  describe('Given a virtual file system with router + components', () => {
    const files: Record<string, string> = {
      'src/router.tsx': `
        import { defineRoutes } from '@vertz/ui';
        import { HomePage } from './pages/home-page';
        import { ProjectsPage } from './pages/projects-page';
        import { ProjectLayout } from './components/project-layout';
        import { IssueListPage } from './pages/issue-list-page';

        export const routes = defineRoutes({
          '/': { component: () => <HomePage /> },
          '/projects': {
            component: () => <ProjectsPage />,
          },
          '/projects/:projectId': {
            component: () => <ProjectLayout />,
            children: {
              '/': { component: () => <IssueListPage /> },
            },
          },
        });
      `,
      'src/pages/home-page.tsx': `
        export function HomePage() {
          return <div>Home</div>;
        }
      `,
      'src/pages/projects-page.tsx': `
        import { query } from '@vertz/ui';
        import { api } from '../api';

        export function ProjectsPage() {
          const projects = query(api.projects.list());
          return <div>{projects.data}</div>;
        }
      `,
      'src/components/project-layout.tsx': `
        import { query, useParams } from '@vertz/ui';
        import { api } from '../api';

        export function ProjectLayout() {
          const { projectId } = useParams<'/projects/:projectId'>();
          const project = query(api.projects.get(projectId));
          return <div>{project.data}</div>;
        }
      `,
      'src/pages/issue-list-page.tsx': `
        import { query, useParams } from '@vertz/ui';
        import { api } from '../api';

        export function IssueListPage() {
          const { projectId } = useParams<'/projects/:projectId'>();
          const issues = query(api.issues.list({ where: { projectId } }));
          const labels = query(api.labels.list({ where: { projectId } }));
          return <div>{issues.data}</div>;
        }
      `,
    };

    describe('When generatePrefetchManifest() is called', () => {
      it('Then the manifest contains all routes with their queries', () => {
        const manifest = generatePrefetchManifest({
          routerSource: files['src/router.tsx'],
          routerPath: 'src/router.tsx',
          readFile: (path) => files[path],
          resolveImport: (specifier, fromFile) => {
            if (!specifier.startsWith('.')) return undefined;
            // Simple inline resolver for tests
            const dir = fromFile.replace(/\/[^/]+$/, '');
            const resolved = `${dir}/${specifier.replace(/^\.\//, '')}.tsx`;
            return files[resolved] ? resolved : undefined;
          },
        });

        // Check route count
        expect(manifest.routes).toHaveLength(4);

        // Home page — no queries
        const home = manifest.routes.find((r) => r.pattern === '/');
        expect(home).toBeDefined();
        expect(home?.queries).toHaveLength(0);

        // Projects page — 1 query
        const projects = manifest.routes.find((r) => r.pattern === '/projects');
        expect(projects).toBeDefined();
        expect(projects?.queries).toHaveLength(1);
        expect(projects?.queries[0].descriptorChain).toBe('api.projects.list');

        // Project layout — 1 query, params
        const layout = manifest.routes.find((r) => r.pattern === '/projects/:projectId');
        expect(layout).toBeDefined();
        expect(layout?.type).toBe('layout');
        expect(layout?.queries).toHaveLength(1);
        expect(layout?.queries[0].descriptorChain).toBe('api.projects.get');
        expect(layout?.params).toContain('projectId');

        // Issue list page — 2 queries
        const issueList = manifest.routes.find(
          (r) => r.pattern === '/projects/:projectId' && r.type === 'page',
        );
        expect(issueList).toBeDefined();
        expect(issueList?.queries).toHaveLength(2);
      });

      it('Then the manifest includes generatedAt timestamp', () => {
        const manifest = generatePrefetchManifest({
          routerSource: files['src/router.tsx'],
          routerPath: 'src/router.tsx',
          readFile: (path) => files[path],
          resolveImport: (specifier, fromFile) => {
            if (!specifier.startsWith('.')) return undefined;
            const dir = fromFile.replace(/\/[^/]+$/, '');
            const resolved = `${dir}/${specifier.replace(/^\.\//, '')}.tsx`;
            return files[resolved] ? resolved : undefined;
          },
        });

        expect(manifest.generatedAt).toBeDefined();
        expect(typeof manifest.generatedAt).toBe('string');
      });
    });
  });

  describe('Given an unresolvable component import', () => {
    const files: Record<string, string> = {
      'src/router.tsx': `
        import { defineRoutes } from '@vertz/ui';
        import { MissingPage } from './pages/missing';

        export const routes = defineRoutes({
          '/missing': { component: () => <MissingPage /> },
        });
      `,
    };

    describe('When generatePrefetchManifest() is called', () => {
      it('Then unresolvable components are included with empty queries', () => {
        const manifest = generatePrefetchManifest({
          routerSource: files['src/router.tsx'],
          routerPath: 'src/router.tsx',
          readFile: () => undefined,
          resolveImport: () => undefined,
        });

        expect(manifest.routes).toHaveLength(1);
        expect(manifest.routes[0].componentName).toBe('MissingPage');
        expect(manifest.routes[0].queries).toHaveLength(0);
      });
    });
  });

  describe('Given the real linear clone project', () => {
    const linearSrcDir = resolve(import.meta.dir, '../../../../examples/linear/src');
    const routerPath = resolve(linearSrcDir, 'router.tsx');
    const routerSource = readFileSync(routerPath, 'utf-8');

    const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

    function resolveImport(specifier: string, fromFile: string): string | undefined {
      if (!specifier.startsWith('.')) return undefined;
      const dir = fromFile.replace(/\/[^/]+$/, '');
      const base = resolve(dir, specifier);
      // Extension probing
      for (const ext of EXTENSIONS) {
        const candidate = `${base}${ext}`;
        try {
          readFileSync(candidate);
          return candidate;
        } catch {
          // continue
        }
      }
      // Index probing
      for (const ext of EXTENSIONS) {
        const candidate = resolve(base, `index${ext}`);
        try {
          readFileSync(candidate);
          return candidate;
        } catch {
          // continue
        }
      }
      return undefined;
    }

    describe('When generatePrefetchManifest() is called on the real project', () => {
      it('Then all route patterns are present', () => {
        const manifest = generatePrefetchManifest({
          routerSource,
          routerPath,
          readFile: (path) => {
            try {
              return readFileSync(path, 'utf-8');
            } catch {
              return undefined;
            }
          },
          resolveImport,
        });

        const patterns = manifest.routes.map((r) => r.pattern);
        expect(patterns).toContain('/login');
        expect(patterns).toContain('/');
        expect(patterns).toContain('/projects');
        expect(patterns).toContain('/projects/:projectId');
        expect(patterns).toContain('/projects/:projectId/board');
        expect(patterns).toContain('/projects/:projectId/issues/:issueId');
      });

      it('Then ProjectsPage has api.projects.list query', () => {
        const manifest = generatePrefetchManifest({
          routerSource,
          routerPath,
          readFile: (path) => {
            try {
              return readFileSync(path, 'utf-8');
            } catch {
              return undefined;
            }
          },
          resolveImport,
        });

        const projectsRoute = manifest.routes.find((r) => r.componentName === 'ProjectsPage');
        expect(projectsRoute).toBeDefined();
        const chains = projectsRoute?.queries.map((q) => q.descriptorChain) ?? [];
        expect(chains).toContain('api.projects.list');
      });

      it('Then ProjectLayout has api.projects.get with projectId param', () => {
        const manifest = generatePrefetchManifest({
          routerSource,
          routerPath,
          readFile: (path) => {
            try {
              return readFileSync(path, 'utf-8');
            } catch {
              return undefined;
            }
          },
          resolveImport,
        });

        const layout = manifest.routes.find((r) => r.componentName === 'ProjectLayout');
        expect(layout).toBeDefined();
        expect(layout?.type).toBe('layout');
        const chains = layout?.queries.map((q) => q.descriptorChain) ?? [];
        expect(chains).toContain('api.projects.get');
        expect(layout?.params).toContain('projectId');
      });

      it('Then IssueListPage has 3 queries (issues.list, projects.get, labels.list)', () => {
        const manifest = generatePrefetchManifest({
          routerSource,
          routerPath,
          readFile: (path) => {
            try {
              return readFileSync(path, 'utf-8');
            } catch {
              return undefined;
            }
          },
          resolveImport,
        });

        const issueList = manifest.routes.find((r) => r.componentName === 'IssueListPage');
        expect(issueList).toBeDefined();
        const chains = issueList?.queries.map((q) => q.descriptorChain) ?? [];
        expect(chains).toContain('api.issues.list');
        expect(chains).toContain('api.projects.get');
        expect(chains).toContain('api.labels.list');
      });

      it('Then IssueDetailPage has 3 queries (issues.get, labels.list, issueLabels.list)', () => {
        const manifest = generatePrefetchManifest({
          routerSource,
          routerPath,
          readFile: (path) => {
            try {
              return readFileSync(path, 'utf-8');
            } catch {
              return undefined;
            }
          },
          resolveImport,
        });

        const issueDetail = manifest.routes.find((r) => r.componentName === 'IssueDetailPage');
        expect(issueDetail).toBeDefined();
        const chains = issueDetail?.queries.map((q) => q.descriptorChain) ?? [];
        expect(chains).toContain('api.issues.get');
        expect(chains).toContain('api.labels.list');
        expect(chains).toContain('api.issueLabels.list');
      });

      it('Then root layout ProtectedRoute has no queries (external package)', () => {
        const manifest = generatePrefetchManifest({
          routerSource,
          routerPath,
          readFile: (path) => {
            try {
              return readFileSync(path, 'utf-8');
            } catch {
              return undefined;
            }
          },
          resolveImport,
        });

        // The root '/' route uses ProtectedRoute as the outermost JSX component.
        // It's from @vertz/ui-auth (external package), so resolveImport returns
        // undefined and no queries are extracted. This is expected behavior.
        const root = manifest.routes.find(
          (r) => r.pattern === '/' && r.componentName === 'ProtectedRoute',
        );
        expect(root).toBeDefined();
        expect(root?.queries).toHaveLength(0);
      });

      it('Then IssueListPage queries have correct bindings', () => {
        const manifest = generatePrefetchManifest({
          routerSource,
          routerPath,
          readFile: (path) => {
            try {
              return readFileSync(path, 'utf-8');
            } catch {
              return undefined;
            }
          },
          resolveImport,
        });

        const issueList = manifest.routes.find((r) => r.componentName === 'IssueListPage');
        expect(issueList).toBeDefined();

        // api.issues.list({ where: { projectId }, select: {...}, include: {...} })
        const issuesQuery = issueList?.queries.find((q) => q.descriptorChain === 'api.issues.list');
        expect(issuesQuery?.entity).toBe('issues');
        expect(issuesQuery?.operation).toBe('list');
        expect(issuesQuery?.queryBindings?.where).toEqual({ projectId: '$projectId' });
        expect(issuesQuery?.queryBindings?.select).toEqual({
          id: true,
          number: true,
          title: true,
          status: true,
          priority: true,
        });
        expect(issuesQuery?.queryBindings?.include).toEqual({ labels: true });

        // api.projects.get(projectId)
        const projectQuery = issueList?.queries.find(
          (q) => q.descriptorChain === 'api.projects.get',
        );
        expect(projectQuery?.entity).toBe('projects');
        expect(projectQuery?.operation).toBe('get');
        expect(projectQuery?.idParam).toBe('projectId');

        // api.labels.list({ where: { projectId }, select: {...} })
        const labelsQuery = issueList?.queries.find((q) => q.descriptorChain === 'api.labels.list');
        expect(labelsQuery?.entity).toBe('labels');
        expect(labelsQuery?.operation).toBe('list');
        expect(labelsQuery?.queryBindings?.where).toEqual({ projectId: '$projectId' });
        expect(labelsQuery?.queryBindings?.select).toEqual({
          id: true,
          name: true,
          color: true,
        });
      });

      it('Then ProjectLayout api.projects.get has idParam="projectId"', () => {
        const manifest = generatePrefetchManifest({
          routerSource,
          routerPath,
          readFile: (path) => {
            try {
              return readFileSync(path, 'utf-8');
            } catch {
              return undefined;
            }
          },
          resolveImport,
        });

        const layout = manifest.routes.find((r) => r.componentName === 'ProjectLayout');
        const getQuery = layout?.queries.find((q) => q.descriptorChain === 'api.projects.get');
        expect(getQuery?.entity).toBe('projects');
        expect(getQuery?.operation).toBe('get');
        expect(getQuery?.idParam).toBe('projectId');
      });
    });
  });
});
