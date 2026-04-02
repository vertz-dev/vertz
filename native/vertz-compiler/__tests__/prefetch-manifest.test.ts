import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

interface ExtractedRoute {
  pattern: string;
  componentName: string;
  routeType: string; // 'layout' | 'page'
}

interface ExtractedQuery {
  descriptorChain: string;
  entity?: string;
  operation?: string;
  idParam?: string;
}

interface CompileResult {
  code: string;
  extractedRoutes?: ExtractedRoute[];
  extractedQueries?: ExtractedQuery[];
  routeParams?: string[];
}

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: { filename?: string; prefetchManifest?: boolean },
    ) => CompileResult;
  };
}

function compileWithPrefetch(source: string, filename = 'src/router.tsx') {
  const { compile } = loadCompiler();
  return compile(source, { filename, prefetchManifest: true });
}

describe('Feature: Prefetch manifest analysis (#1910)', () => {
  describe('Route extraction from defineRoutes()', () => {
    it('Then extracts simple routes with component names', () => {
      const source = `
        import { defineRoutes } from '@vertz/ui';
        import { HomePage } from './pages/home';
        import { AboutPage } from './pages/about';

        export const routes = defineRoutes({
          '/': { component: () => HomePage() },
          '/about': { component: () => AboutPage() },
        });
      `;

      const result = compileWithPrefetch(source);

      expect(result.extractedRoutes).toBeDefined();
      expect(result.extractedRoutes).toHaveLength(2);
      expect(result.extractedRoutes![0].pattern).toBe('/');
      expect(result.extractedRoutes![0].componentName).toBe('HomePage');
      expect(result.extractedRoutes![0].routeType).toBe('page');
      expect(result.extractedRoutes![1].pattern).toBe('/about');
      expect(result.extractedRoutes![1].componentName).toBe('AboutPage');
    });

    it('Then extracts nested routes and flattens patterns', () => {
      const source = `
        import { defineRoutes } from '@vertz/ui';
        import { DashboardLayout } from './layouts/dashboard';
        import { OverviewPage } from './pages/overview';
        import { SettingsPage } from './pages/settings';

        export const routes = defineRoutes({
          '/dashboard': {
            component: () => DashboardLayout(),
            children: {
              '/': { component: () => OverviewPage() },
              '/settings': { component: () => SettingsPage() },
            },
          },
        });
      `;

      const result = compileWithPrefetch(source);

      expect(result.extractedRoutes).toHaveLength(3);
      expect(result.extractedRoutes![0].pattern).toBe('/dashboard');
      expect(result.extractedRoutes![0].componentName).toBe('DashboardLayout');
      expect(result.extractedRoutes![0].routeType).toBe('layout');
      expect(result.extractedRoutes![1].pattern).toBe('/dashboard');
      expect(result.extractedRoutes![1].componentName).toBe('OverviewPage');
      expect(result.extractedRoutes![2].pattern).toBe('/dashboard/settings');
      expect(result.extractedRoutes![2].componentName).toBe('SettingsPage');
    });

    it('Then extracts component names from JSX factories', () => {
      const source = `
        import { defineRoutes } from '@vertz/ui';
        import { HomePage } from './pages/home';

        export const routes = defineRoutes({
          '/': { component: () => <HomePage /> },
        });
      `;

      const result = compileWithPrefetch(source);

      expect(result.extractedRoutes).toHaveLength(1);
      expect(result.extractedRoutes![0].componentName).toBe('HomePage');
    });

    it('Then returns empty when no defineRoutes() found', () => {
      const source = `
        function App() {
          return <div>Hello</div>;
        }
      `;

      const result = compileWithPrefetch(source);
      expect(result.extractedRoutes).toBeUndefined();
    });
  });

  describe('Component query analysis', () => {
    it('Then extracts query() descriptor chains', () => {
      const source = `
        import { query } from '@vertz/ui';

        function TaskList() {
          const tasks = query(api.tasks.list());
          return <div>{tasks.data.items.map(t => <span>{t.title}</span>)}</div>;
        }
      `;

      const result = compileWithPrefetch(source, 'src/pages/task-list.tsx');

      expect(result.extractedQueries).toBeDefined();
      expect(result.extractedQueries).toHaveLength(1);
      expect(result.extractedQueries![0].descriptorChain).toBe('api.tasks.list');
      expect(result.extractedQueries![0].entity).toBe('tasks');
      expect(result.extractedQueries![0].operation).toBe('list');
    });

    it('Then extracts get() query with idParam from route params', () => {
      const source = `
        import { query } from '@vertz/ui';
        import { useParams } from '@vertz/ui';

        function TaskDetail() {
          const { taskId } = useParams();
          const task = query(api.tasks.get(taskId));
          return <div>{task.data.title}</div>;
        }
      `;

      const result = compileWithPrefetch(source, 'src/pages/task-detail.tsx');

      expect(result.extractedQueries).toHaveLength(1);
      expect(result.extractedQueries![0].descriptorChain).toBe('api.tasks.get');
      expect(result.extractedQueries![0].entity).toBe('tasks');
      expect(result.extractedQueries![0].operation).toBe('get');
      expect(result.extractedQueries![0].idParam).toBe('taskId');
      expect(result.routeParams).toContain('taskId');
    });

    it('Then extracts multiple queries from one component', () => {
      const source = `
        import { query } from '@vertz/ui';

        function Dashboard() {
          const tasks = query(api.tasks.list());
          const users = query(api.users.list());
          return <div />;
        }
      `;

      const result = compileWithPrefetch(source, 'src/pages/dashboard.tsx');

      expect(result.extractedQueries).toHaveLength(2);
      expect(result.extractedQueries![0].entity).toBe('tasks');
      expect(result.extractedQueries![1].entity).toBe('users');
    });

    it('Then returns empty queries when no query() calls', () => {
      const source = `
        function StaticPage() {
          return <div>Hello</div>;
        }
      `;

      const result = compileWithPrefetch(source, 'src/pages/static.tsx');
      expect(result.extractedQueries).toBeUndefined();
    });
  });

  describe('Given prefetchManifest is disabled', () => {
    it('Then does not return routes or queries', () => {
      const source = `
        import { defineRoutes } from '@vertz/ui';
        import { HomePage } from './pages/home';

        export const routes = defineRoutes({
          '/': { component: () => HomePage() },
        });
      `;

      const { compile } = loadCompiler();
      const result = compile(source, { filename: 'src/router.tsx' });
      expect(result.extractedRoutes).toBeUndefined();
      expect(result.extractedQueries).toBeUndefined();
    });
  });
});
