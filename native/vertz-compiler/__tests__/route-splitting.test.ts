import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: { filename?: string; routeSplitting?: boolean },
    ) => { code: string };
  };
}

function compileWithSplitting(source: string) {
  const { compile } = loadCompiler();
  return compile(source, { filename: 'src/routes.tsx', routeSplitting: true });
}

describe('Feature: Route code splitting (#1910)', () => {
  describe('Given a defineRoutes call with static imports', () => {
    describe('When compiled with routeSplitting: true', () => {
      it('Then converts static component factory to dynamic import', () => {
        const result = compileWithSplitting(`
          import { defineRoutes } from '@vertz/ui';
          import { HomePage } from './pages/home';

          export const routes = defineRoutes({
            '/': { component: () => HomePage() },
          });
        `);

        expect(result.code).toContain("import('./pages/home')");
        expect(result.code).toContain('.then(m =>');
        expect(result.code).toContain('m.HomePage');
      });

      it('Then removes the unused static import', () => {
        const result = compileWithSplitting(`
          import { defineRoutes } from '@vertz/ui';
          import { HomePage } from './pages/home';

          export const routes = defineRoutes({
            '/': { component: () => HomePage() },
          });
        `);

        expect(result.code).not.toContain("import { HomePage } from './pages/home'");
      });
    });
  });

  describe('Given a default import in route factory', () => {
    describe('When compiled with routeSplitting: true', () => {
      it('Then uses m.default in the dynamic import', () => {
        const result = compileWithSplitting(`
          import { defineRoutes } from '@vertz/ui';
          import HomePage from './pages/home';

          export const routes = defineRoutes({
            '/': { component: () => HomePage() },
          });
        `);

        expect(result.code).toContain("import('./pages/home')");
        expect(result.code).toContain('m.default');
      });
    });
  });

  describe('Given a JSX factory in route component', () => {
    describe('When compiled with routeSplitting: true', () => {
      it('Then converts JSX factory to dynamic import', () => {
        const result = compileWithSplitting(`
          import { defineRoutes } from '@vertz/ui';
          import { Dashboard } from './pages/dashboard';

          export const routes = defineRoutes({
            '/dashboard': { component: () => <Dashboard /> },
          });
        `);

        expect(result.code).toContain("import('./pages/dashboard')");
        expect(result.code).toContain('m.Dashboard');
      });
    });
  });

  describe('Given a component used outside defineRoutes', () => {
    describe('When compiled with routeSplitting: true', () => {
      it('Then does NOT lazify the component', () => {
        const result = compileWithSplitting(`
          import { defineRoutes } from '@vertz/ui';
          import { Layout } from './components/layout';

          const header = Layout();

          export const routes = defineRoutes({
            '/': { component: () => Layout() },
          });
        `);

        // Layout is used outside defineRoutes, so it should NOT be lazified
        expect(result.code).not.toContain("import('./components/layout')");
        expect(result.code).toContain("import { Layout } from './components/layout'");
      });
    });
  });

  describe('Given nested routes with children', () => {
    describe('When compiled with routeSplitting: true', () => {
      it('Then lazifies components in nested routes', () => {
        const result = compileWithSplitting(`
          import { defineRoutes } from '@vertz/ui';
          import { Layout } from './pages/layout';
          import { Home } from './pages/home';

          export const routes = defineRoutes({
            '/': {
              component: () => Layout(),
              children: {
                '/home': { component: () => Home() },
              },
            },
          });
        `);

        expect(result.code).toContain("import('./pages/home')");
        expect(result.code).toContain("import('./pages/layout')");
      });
    });
  });

  describe('Given an aliased import', () => {
    describe('When compiled with routeSplitting: true', () => {
      it('Then uses original export name in dynamic import', () => {
        const result = compileWithSplitting(`
          import { defineRoutes } from '@vertz/ui';
          import { HomePage as Home } from './pages/home';

          export const routes = defineRoutes({
            '/': { component: () => Home() },
          });
        `);

        expect(result.code).toContain("import('./pages/home')");
        expect(result.code).toContain('m.HomePage');
      });
    });
  });

  describe('Given a package import (not relative)', () => {
    describe('When compiled with routeSplitting: true', () => {
      it('Then does NOT lazify package imports', () => {
        const result = compileWithSplitting(`
          import { defineRoutes } from '@vertz/ui';
          import { AdminPage } from '@acme/admin';

          export const routes = defineRoutes({
            '/admin': { component: () => AdminPage() },
          });
        `);

        expect(result.code).not.toContain("import('@acme/admin')");
        expect(result.code).toContain("import { AdminPage } from '@acme/admin'");
      });
    });
  });

  describe('Given no defineRoutes call', () => {
    describe('When compiled with routeSplitting: true', () => {
      it('Then passes through unchanged', () => {
        const result = compileWithSplitting(`
          function App() {
            return <div>Hello</div>;
          }
        `);

        expect(result.code).toContain('__element("div")');
      });
    });
  });

  describe('Given routeSplitting is not set', () => {
    describe('When compiled without the option', () => {
      it('Then does NOT transform routes', () => {
        const { compile } = loadCompiler();
        const result = compile(
          `import { defineRoutes } from '@vertz/ui';
          import { Home } from './pages/home';
          export const routes = defineRoutes({
            '/': { component: () => Home() },
          });`,
          { filename: 'src/routes.tsx' },
        );

        expect(result.code).not.toContain("import('./pages/home')");
      });
    });
  });
});
