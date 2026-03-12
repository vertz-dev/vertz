import { describe, expect, it } from 'bun:test';
import { transformRouteSplitting } from '../route-splitting-transformer';

describe('Feature: Automatic route code splitting', () => {
  describe('Given a route file with named component imports', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { HomePage } from './pages/home';",
      "import { AboutPage } from './pages/about';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => HomePage() },",
      "  '/about': { component: () => AboutPage() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then rewrites component factories to lazy import()', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain("import('./pages/home')");
        expect(result.code).toContain("import('./pages/about')");
        expect(result.code).not.toContain('import { HomePage }');
        expect(result.code).not.toContain('import { AboutPage }');
      });

      it('Then preserves the { default: () => Node } contract', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.code).toContain(
          "import('./pages/home').then(m => ({ default: () => m.HomePage() }))",
        );
        expect(result.code).toContain(
          "import('./pages/about').then(m => ({ default: () => m.AboutPage() }))",
        );
      });

      it('Then reports diagnostics for each transformed route', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.diagnostics).toHaveLength(2);
        expect(result.diagnostics[0]).toEqual({
          routePath: "'/'",
          importSource: './pages/home',
          symbolName: 'HomePage',
        });
      });
    });
  });

  describe('Given a route file with default imports', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import ManifestoPage from './pages/manifesto';",
      '',
      'export const routes = defineRoutes({',
      "  '/manifesto': { component: () => ManifestoPage() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then uses m.default() for default imports', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain(
          "import('./pages/manifesto').then(m => ({ default: () => m.default() }))",
        );
        expect(result.code).not.toContain('import ManifestoPage');
      });
    });
  });

  describe('Given a route file with JSX component factories (no props)', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { HomePage } from './pages/home';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => <HomePage /> },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then transforms JSX factories to lazy import()', () => {
        const result = transformRouteSplitting(input, '/app/src/router.tsx');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain("import('./pages/home')");
        expect(result.code).toContain('.then(m => ({ default: () => m.HomePage() }))');
      });
    });
  });

  describe('Given a route file with JSX component factories (with props)', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      '  \'/\': { component: () => <Page title="Hello" count={42} /> },',
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then preserves JSX props as function arguments', () => {
        const result = transformRouteSplitting(input, '/app/src/router.tsx');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain(
          '.then(m => ({ default: () => m.Page({ title: "Hello", count: 42 }) }))',
        );
      });
    });
  });

  describe('Given an aliased import', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { SomePage as Page } from './pages/some-page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => Page() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then uses the original exported name in the lazy import', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        // Must use m.SomePage (the exported name), not m.Page (the local alias)
        expect(result.code).toContain('.then(m => ({ default: () => m.SomePage() }))');
        expect(result.code).not.toContain('m.Page()');
      });
    });
  });

  describe('Given a factory with arguments', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => Page({ showNav: true }) },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then preserves the arguments in the lazy wrapper', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain('.then(m => ({ default: () => m.Page({ showNav: true }) }))');
      });
    });
  });

  describe('Given a factory with arguments from the same import', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { Page, defaultConfig } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => Page(defaultConfig) },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then preserves the co-imported argument specifier', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain("import { defaultConfig } from './pages/page'");
      });
    });
  });

  describe('Given nested routes with children', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { Layout } from './pages/layout';",
      "import { DashHome } from './pages/dash-home';",
      '',
      'export const routes = defineRoutes({',
      "  '/dashboard': {",
      '    component: () => Layout(),',
      '    children: {',
      "      '/': { component: () => DashHome() },",
      '    },',
      '  },',
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then transforms both parent and child routes', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.diagnostics).toHaveLength(2);
        expect(result.code).toContain("import('./pages/layout')");
        expect(result.code).toContain("import('./pages/dash-home')");
      });
    });
  });

  describe('Given partially-used imports', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { TaskListPage, taskUtils } from './pages/task-list';",
      '',
      'const x = taskUtils();',
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => TaskListPage() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then removes only the lazified specifier from the import', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.code).toContain("import { taskUtils } from './pages/task-list'");
        // Static import should not contain TaskListPage anymore
        expect(result.code).not.toContain('import { TaskListPage');
        expect(result.code).not.toContain('import { taskUtils, TaskListPage');
      });
    });
  });
});

describe('Feature: Route splitting bail-outs', () => {
  describe('Given a component used outside defineRoutes', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { SharedPage } from './pages/shared';",
      '',
      'console.log(SharedPage);',
      '',
      'export const routes = defineRoutes({',
      "  '/shared': { component: () => SharedPage() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then skips the factory and reports symbol-used-elsewhere', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.code).toContain('import { SharedPage }');
        expect(result.skipped[0]?.reason).toBe('symbol-used-elsewhere');
      });
    });
  });

  describe('Given a component factory with block body', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => { return Page(); } },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then skips the factory and reports block-body', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.skipped[0]?.reason).toBe('block-body');
      });
    });
  });

  describe('Given defineRoutes from a non-vertz package', () => {
    const input = [
      "import { defineRoutes } from 'some-other-lib';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => Page() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then does not transform (not a vertz defineRoutes)', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
      });
    });
  });

  describe('Given a route file with no defineRoutes call', () => {
    const input = ["import { something } from './utils';", 'export const x = something();'].join(
      '\n',
    );

    describe('When transformRouteSplitting is called', () => {
      it('Then returns the source unchanged', () => {
        const result = transformRouteSplitting(input, '/app/src/utils.ts');
        expect(result.transformed).toBe(false);
        expect(result.code).toBe(input);
      });
    });
  });

  describe('Given a local function (not imported)', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      '',
      'function LocalPage() { return document.createElement("div"); }',
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => LocalPage() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then skips with not-imported-symbol', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.skipped[0]?.reason).toBe('not-imported-symbol');
      });
    });
  });

  describe('Given a package import (not relative)', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { SomeThing } from 'some-package';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => SomeThing() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then skips with not-imported-symbol (package imports not in map)', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.skipped[0]?.reason).toBe('not-imported-symbol');
      });
    });
  });

  describe('Given a component value that is not an arrow function', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: Page },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then skips with not-arrow-function', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.skipped[0]?.reason).toBe('not-arrow-function');
      });
    });
  });

  describe('Given a defineRoutes call with variable argument', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      '',
      'const routeMap = {};',
      'export const routes = defineRoutes(routeMap);',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then skips with dynamic-route-map', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.skipped[0]?.reason).toBe('dynamic-route-map');
      });
    });
  });

  describe('Given a spread element inside defineRoutes', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { otherRoutes } from './other';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      '  ...otherRoutes,',
      "  '/': { component: () => Page() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then transforms eligible routes and reports spread-element for the spread', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.skipped.some((s) => s.reason === 'spread-element')).toBe(true);
      });
    });
  });

  describe('Given an already lazy component (import())', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => import('./pages/home') },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then skips with already-lazy', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(false);
        expect(result.skipped[0]?.reason).toBe('already-lazy');
      });
    });
  });

  describe('Given defineRoutes imported from @vertz/ui/router', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui/router';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => Page() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then transforms (recognizes @vertz/ui/router)', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.transformed).toBe(true);
      });
    });
  });

  describe('Given a source map is generated', () => {
    const input = [
      "import { defineRoutes } from '@vertz/ui';",
      "import { Page } from './pages/page';",
      '',
      'export const routes = defineRoutes({',
      "  '/': { component: () => Page() },",
      '});',
    ].join('\n');

    describe('When transformRouteSplitting is called', () => {
      it('Then returns a valid source map', () => {
        const result = transformRouteSplitting(input, '/app/src/router.ts');
        expect(result.map).not.toBeNull();
        expect(result.map!.sources).toContain('/app/src/router.ts');
      });
    });
  });
});
