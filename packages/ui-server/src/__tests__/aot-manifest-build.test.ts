import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AotBuildComponentEntry,
  AotCompiledFile,
  AotRouteMapEntry,
} from '../aot-manifest-build';
import {
  attachPerRouteCss,
  buildAotRouteMap,
  findAppComponent,
  generateAotBarrel,
  generateAotBuildManifest,
} from '../aot-manifest-build';

describe('generateAotBuildManifest', () => {
  let tmpDir: string;
  let srcDir: string;

  beforeEach(() => {
    tmpDir = join(import.meta.dir, `.tmp-aot-build-${Date.now()}`);
    srcDir = join(tmpDir, 'src');
    mkdirSync(srcDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Given a src directory with TSX component files', () => {
    describe('When generateAotBuildManifest is called', () => {
      it('Then returns manifest with classified components', () => {
        writeFileSync(
          join(srcDir, 'header.tsx'),
          `export function Header() { return <header><h1>Hello</h1></header>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        expect(result.components.Header).toBeDefined();
        expect(result.components.Header.tier).toBe('static');
        expect(result.components.Header.holes).toEqual([]);
      });

      it('Then classifies data-driven components correctly', () => {
        writeFileSync(
          join(srcDir, 'greeting.tsx'),
          `export function Greeting({ name }: { name: string }) { return <h1>{name}</h1>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        expect(result.components.Greeting.tier).toBe('data-driven');
      });

      it('Then handles multiple files and components', () => {
        writeFileSync(
          join(srcDir, 'header.tsx'),
          `export function Header() { return <header>Hi</header>; }`,
        );
        writeFileSync(
          join(srcDir, 'footer.tsx'),
          `export function Footer() { return <footer>Bye</footer>; }\nexport function Copyright() { return <span>© 2026</span>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        expect(Object.keys(result.components).sort()).toEqual(['Copyright', 'Footer', 'Header']);
      });

      it('Then skips non-TSX files', () => {
        writeFileSync(join(srcDir, 'utils.ts'), 'export const foo = 42;');
        writeFileSync(
          join(srcDir, 'header.tsx'),
          `export function Header() { return <h1>Hi</h1>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        expect(Object.keys(result.components)).toEqual(['Header']);
      });

      it('Then includes classification log lines', () => {
        writeFileSync(
          join(srcDir, 'header.tsx'),
          `export function Header() { return <h1>Hi</h1>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        expect(result.classificationLog.length).toBeGreaterThan(0);
        expect(result.classificationLog[0]).toContain('Header');
        expect(result.classificationLog[0]).toContain('static');
      });

      it('Then recurses into subdirectories', () => {
        mkdirSync(join(srcDir, 'components'), { recursive: true });
        writeFileSync(
          join(srcDir, 'components', 'card.tsx'),
          `export function Card() { return <div>Card</div>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        expect(result.components.Card).toBeDefined();
      });

      it('Then includes coverage summary in log', () => {
        writeFileSync(
          join(srcDir, 'header.tsx'),
          `export function Header() { return <h1>Hi</h1>; }`,
        );
        // Multiple returns → runtime-fallback
        writeFileSync(
          join(srcDir, 'cond.tsx'),
          `export function Cond({ x }: { x: boolean }) { if (x) return <a>A</a>; return <b>B</b>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        const coverageLine = result.classificationLog.find((l) => l.startsWith('Coverage:'));
        expect(coverageLine).toBeDefined();
        expect(coverageLine).toContain('/2');
      });
    });
  });

  describe('Given a component that references child components (holes)', () => {
    describe('When generateAotBuildManifest is called', () => {
      it('Then logs holes count in classification log', () => {
        writeFileSync(
          join(srcDir, 'layout.tsx'),
          `function Sidebar() { return <aside>Side</aside>; }
export function Layout() { return <div><main>Content</main><Sidebar /></div>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        expect(result.components.Layout).toBeDefined();
        expect(result.components.Layout.holes).toEqual(['Sidebar']);
        const layoutLine = result.classificationLog.find((l) => l.startsWith('Layout:'));
        expect(layoutLine).toContain('1 hole');
        expect(layoutLine).toContain('Sidebar');
      });

      it('Then uses plural "holes" for multiple holes', () => {
        writeFileSync(
          join(srcDir, 'page.tsx'),
          `function Header() { return <header>H</header>; }
function Footer() { return <footer>F</footer>; }
export function Page() { return <div><Header /><main>Body</main><Footer /></div>; }`,
        );

        const result = generateAotBuildManifest(srcDir);

        expect(result.components.Page.holes.length).toBe(2);
        const pageLine = result.classificationLog.find((l) => l.startsWith('Page:'));
        expect(pageLine).toContain('2 holes');
      });
    });
  });

  describe('Given a file that fails to compile', () => {
    describe('When generateAotBuildManifest is called', () => {
      it('Then skips the broken file and continues', () => {
        writeFileSync(join(srcDir, 'broken.tsx'), 'this is {{ not valid');
        writeFileSync(join(srcDir, 'good.tsx'), `export function Good() { return <div>OK</div>; }`);

        const result = generateAotBuildManifest(srcDir);

        expect(result.components.Good).toBeDefined();
        expect(result.components.Good.tier).toBe('static');
      });
    });
  });

  describe('Given an empty src directory', () => {
    describe('When generateAotBuildManifest is called', () => {
      it('Then returns an empty manifest', () => {
        const result = generateAotBuildManifest(srcDir);

        expect(Object.keys(result.components)).toEqual([]);
        expect(result.classificationLog).toEqual([]);
      });
    });
  });

  describe('Given compiled code preservation', () => {
    describe('When generateAotBuildManifest is called', () => {
      it('Then preserves compiled code in compiledFiles', () => {
        writeFileSync(
          join(srcDir, 'header.tsx'),
          `export function Header() { return <header><h1>Hello</h1></header>; }`,
        );

        const result = generateAotBuildManifest(srcDir);
        const filePath = join(srcDir, 'header.tsx');

        expect(result.compiledFiles[filePath]).toBeDefined();
        expect(result.compiledFiles[filePath].code).toContain('__ssr_Header');
        expect(result.compiledFiles[filePath].components).toHaveLength(1);
        expect(result.compiledFiles[filePath].components[0].name).toBe('Header');
      });

      it('Then includes queryKeys in compiled file components', () => {
        writeFileSync(
          join(srcDir, 'projects.tsx'),
          `import { query } from '@vertz/ui';
function ProjectsPage() {
  const projects = query(api.projects.list());
  return <div>Projects</div>;
}`,
        );

        const result = generateAotBuildManifest(srcDir);
        const filePath = join(srcDir, 'projects.tsx');

        expect(result.compiledFiles[filePath]).toBeDefined();
        expect(result.compiledFiles[filePath].components[0].queryKeys).toEqual(['projects-list']);
      });

      it('Then does not include compiledFiles for broken files', () => {
        writeFileSync(join(srcDir, 'broken.tsx'), 'this is {{ not valid');
        writeFileSync(join(srcDir, 'good.tsx'), `export function Good() { return <div>OK</div>; }`);

        const result = generateAotBuildManifest(srcDir);

        expect(result.compiledFiles[join(srcDir, 'broken.tsx')]).toBeUndefined();
        expect(result.compiledFiles[join(srcDir, 'good.tsx')]).toBeDefined();
      });
    });
  });
});

describe('buildAotRouteMap', () => {
  describe('Given AOT components and route definitions', () => {
    describe('When buildAotRouteMap is called', () => {
      it('Then maps route patterns to render function names', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          HomePage: { tier: 'static', holes: [], queryKeys: [] },
          ProjectsPage: { tier: 'data-driven', holes: [], queryKeys: ['projects-list'] },
        };
        const routes = [
          { pattern: '/', componentName: 'HomePage' },
          { pattern: '/projects', componentName: 'ProjectsPage' },
        ];

        const routeMap = buildAotRouteMap(components, routes);

        expect(routeMap['/']?.renderFn).toBe('__ssr_HomePage');
        expect(routeMap['/']?.holes).toEqual([]);
        expect(routeMap['/']?.queryKeys).toEqual([]);
        expect(routeMap['/projects']?.renderFn).toBe('__ssr_ProjectsPage');
        expect(routeMap['/projects']?.queryKeys).toEqual(['projects-list']);
      });

      it('Then skips routes for runtime-fallback components', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          HomePage: { tier: 'static', holes: [], queryKeys: [] },
          DynamicPage: { tier: 'runtime-fallback', holes: [], queryKeys: [] },
        };
        const routes = [
          { pattern: '/', componentName: 'HomePage' },
          { pattern: '/dynamic', componentName: 'DynamicPage' },
        ];

        const routeMap = buildAotRouteMap(components, routes);

        expect(routeMap['/']).toBeDefined();
        expect(routeMap['/dynamic']).toBeUndefined();
      });

      it('Then skips routes for unknown components', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          HomePage: { tier: 'static', holes: [], queryKeys: [] },
        };
        const routes = [
          { pattern: '/', componentName: 'HomePage' },
          { pattern: '/missing', componentName: 'MissingPage' },
        ];

        const routeMap = buildAotRouteMap(components, routes);

        expect(routeMap['/']).toBeDefined();
        expect(routeMap['/missing']).toBeUndefined();
      });

      it('Then populates paramBindings from parameterized queryKeys', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          GameDetailPage: {
            tier: 'data-driven',
            holes: [],
            queryKeys: ['game-${slug}'],
          },
        };
        const routes = [{ pattern: '/games/:slug', componentName: 'GameDetailPage' }];

        const routeMap = buildAotRouteMap(components, routes);

        expect(routeMap['/games/:slug']?.paramBindings).toEqual(['slug']);
      });

      it('Then omits paramBindings when queryKeys are all static', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          HomePage: { tier: 'static', holes: [], queryKeys: [] },
        };
        const routes = [{ pattern: '/', componentName: 'HomePage' }];

        const routeMap = buildAotRouteMap(components, routes);

        expect(routeMap['/']?.paramBindings).toBeUndefined();
      });

      it('Then includes holes from the component entry', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          Layout: { tier: 'static', holes: ['Sidebar', 'Footer'], queryKeys: [] },
        };
        const routes = [{ pattern: '/', componentName: 'Layout' }];

        const routeMap = buildAotRouteMap(components, routes);

        expect(routeMap['/']?.holes).toEqual(['Sidebar', 'Footer']);
      });
    });
  });
});

describe('generateAotBarrel', () => {
  describe('Given compiled files and a route map', () => {
    describe('When generateAotBarrel is called', () => {
      it('Then generates import/export statements for each route render function', () => {
        const compiledFiles: Record<string, AotCompiledFile> = {
          '/src/home.tsx': {
            code: 'function __ssr_HomePage() { return "hi"; }',
            components: [{ name: 'HomePage', tier: 'static', holes: [], queryKeys: [] }],
          },
          '/src/projects.tsx': {
            code: 'function __ssr_ProjectsPage() { return "projects"; }',
            components: [
              {
                name: 'ProjectsPage',
                tier: 'data-driven',
                holes: [],
                queryKeys: ['projects-list'],
              },
            ],
          },
        };
        const routeMap: Record<string, AotRouteMapEntry> = {
          '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
          '/projects': { renderFn: '__ssr_ProjectsPage', holes: [], queryKeys: ['projects-list'] },
        };

        const result = generateAotBarrel(compiledFiles, routeMap);

        expect(result.barrelSource).toContain('__ssr_HomePage');
        expect(result.barrelSource).toContain('__ssr_ProjectsPage');
        expect(result.barrelSource).toContain('export');
      });

      it('Then barrel re-exports use .ts extension for Node ESM compatibility', () => {
        const compiledFiles: Record<string, AotCompiledFile> = {
          '/src/home.tsx': {
            code: 'export function __ssr_HomePage() { return "hi"; }',
            components: [{ name: 'HomePage', tier: 'static', holes: [], queryKeys: [] }],
          },
        };
        const routeMap: Record<string, AotRouteMapEntry> = {
          '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
        };

        const result = generateAotBarrel(compiledFiles, routeMap);

        // Node ESM requires explicit .ts extensions — extensionless imports fail silently
        expect(result.barrelSource).toMatch(/from '\.\/__aot_\d+_home\.ts'/);
        expect(result.barrelSource).not.toMatch(/from '\.\/__aot_\d+_home'/);
      });

      it('Then returns compiled file mapping for temp dir writing', () => {
        const compiledFiles: Record<string, AotCompiledFile> = {
          '/src/home.tsx': {
            code: 'export function __ssr_HomePage() { return "hi"; }',
            components: [{ name: 'HomePage', tier: 'static', holes: [], queryKeys: [] }],
          },
        };
        const routeMap: Record<string, AotRouteMapEntry> = {
          '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
        };

        const result = generateAotBarrel(compiledFiles, routeMap);

        // Should have a temp file with the compiled code
        const fileKeys = Object.keys(result.files);
        expect(fileKeys).toHaveLength(1);
        expect(fileKeys[0]).toMatch(/^__aot_\d+_home\.ts$/);
        const firstKey = fileKeys[0];
        expect(firstKey).toBeDefined();
        expect(result.files[firstKey as string]).toContain('__ssr_HomePage');
      });

      it('Then barrel source includes import for AOT runtime helpers', () => {
        const compiledFiles: Record<string, AotCompiledFile> = {
          '/src/home.tsx': {
            code: 'export function __ssr_HomePage() { return __esc("hi"); }',
            components: [{ name: 'HomePage', tier: 'static', holes: [], queryKeys: [] }],
          },
        };
        const routeMap: Record<string, AotRouteMapEntry> = {
          '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
        };

        const result = generateAotBarrel(compiledFiles, routeMap);

        expect(result.barrelSource).toContain(
          "import { __esc, __esc_attr, __ssr_spread, __ssr_style_object } from '@vertz/ui-server';",
        );
      });

      it('Then each compiled file includes its own AOT runtime helper import', () => {
        const compiledFiles: Record<string, AotCompiledFile> = {
          '/src/home.tsx': {
            code: 'export function __ssr_HomePage() { return __esc("hi"); }',
            components: [{ name: 'HomePage', tier: 'static', holes: [], queryKeys: [] }],
          },
          '/src/about.tsx': {
            code: 'export function __ssr_AboutPage() { return __esc("about"); }',
            components: [{ name: 'AboutPage', tier: 'static', holes: [], queryKeys: [] }],
          },
        };
        const routeMap: Record<string, AotRouteMapEntry> = {
          '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
          '/about': { renderFn: '__ssr_AboutPage', holes: [], queryKeys: [] },
        };

        const result = generateAotBarrel(compiledFiles, routeMap);

        const helperImport =
          "import { __esc, __esc_attr, __ssr_spread, __ssr_style_object } from '@vertz/ui-server';";
        const typeImport = "import type { SSRAotContext } from '@vertz/ui-server';";
        for (const [fileName, code] of Object.entries(result.files)) {
          expect(code).toContain(helperImport);
          expect(code).toContain(typeImport);
          expect(code.indexOf(helperImport)).toBe(0);
        }
      });

      it('Then only includes functions that are in the route map', () => {
        const compiledFiles: Record<string, AotCompiledFile> = {
          '/src/home.tsx': {
            code: 'function __ssr_HomePage() {} function __ssr_UnusedComponent() {}',
            components: [
              { name: 'HomePage', tier: 'static', holes: [], queryKeys: [] },
              { name: 'UnusedComponent', tier: 'static', holes: [], queryKeys: [] },
            ],
          },
        };
        const routeMap: Record<string, AotRouteMapEntry> = {
          '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
        };

        const result = generateAotBarrel(compiledFiles, routeMap);

        expect(result.barrelSource).toContain('__ssr_HomePage');
        expect(result.barrelSource).not.toContain('__ssr_UnusedComponent');
      });
    });
  });

  // ─── findAppComponent Tests (#1977) ────────────────────────────

  describe('findAppComponent', () => {
    describe('Given components where one has RouterView as a hole', () => {
      it('Then returns the component with RouterView as the app entry', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          App: { tier: 'data-driven', holes: ['RouterView'], queryKeys: [] },
          HomePage: { tier: 'static', holes: [], queryKeys: [] },
        };

        const result = findAppComponent(components);

        expect(result).toBeDefined();
        expect(result!.renderFn).toBe('__ssr_App');
        expect(result!.holes).toEqual(['RouterView']);
      });
    });

    describe('Given components where the RouterView component has additional holes', () => {
      it('Then returns the component with all its holes', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          App: { tier: 'data-driven', holes: ['ThemeProvider', 'RouterView'], queryKeys: [] },
        };

        const result = findAppComponent(components);

        expect(result).toBeDefined();
        expect(result!.holes).toEqual(['ThemeProvider', 'RouterView']);
      });
    });

    describe('Given no component has RouterView as a hole', () => {
      it('Then returns undefined', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          HomePage: { tier: 'static', holes: [], queryKeys: [] },
          Sidebar: { tier: 'data-driven', holes: ['UserWidget'], queryKeys: [] },
        };

        const result = findAppComponent(components);

        expect(result).toBeUndefined();
      });
    });

    describe('Given the RouterView component is runtime-fallback', () => {
      it('Then returns undefined (runtime-fallback cannot be AOT-rendered)', () => {
        const components: Record<string, AotBuildComponentEntry> = {
          App: { tier: 'runtime-fallback', holes: ['RouterView'], queryKeys: [] },
        };

        const result = findAppComponent(components);

        expect(result).toBeUndefined();
      });
    });
  });

  describe('generateAotBarrel with app entry', () => {
    describe('Given an app entry alongside routes', () => {
      it('Then the barrel includes the app render function', () => {
        const compiledFiles: Record<string, AotCompiledFile> = {
          'app.tsx': {
            code: 'export function __ssr_App() { return ""; }\nexport function __ssr_HomePage() { return ""; }',
            components: [
              { name: 'App', tier: 'data-driven', holes: ['RouterView'], queryKeys: [] },
              { name: 'HomePage', tier: 'static', holes: [], queryKeys: [] },
            ],
          },
        };
        const routeMap: Record<string, AotRouteMapEntry> = {
          '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
        };
        const appEntry: AotRouteMapEntry = {
          renderFn: '__ssr_App',
          holes: ['RouterView'],
          queryKeys: [],
        };

        const result = generateAotBarrel(compiledFiles, routeMap, appEntry);

        expect(result.barrelSource).toContain('__ssr_App');
        expect(result.barrelSource).toContain('__ssr_HomePage');
      });
    });
  });

  describe('Barrel files exclude original source side effects (#1982)', () => {
    it('Then compiled files contain only __ssr_* functions, not original imports/code', () => {
      const compiledFiles: Record<string, AotCompiledFile> = {
        'app.tsx': {
          code: [
            'import { RouterView, createRouter } from "@vertz/ui";',
            'import { routes } from "./router";',
            'var router = createRouter(routes);',
            'function App() { return <div><RouterView router={router} /></div>; }',
            'export function __ssr_App(data, ctx) { return "<div>" + ctx.holes.RouterView() + "</div>"; }',
          ].join('\n'),
          components: [
            { name: 'App', tier: 'data-driven', holes: ['RouterView'], queryKeys: [] },
          ],
        },
      };
      const routeMap: Record<string, AotRouteMapEntry> = {};
      const appEntry: AotRouteMapEntry = {
        renderFn: '__ssr_App',
        holes: ['RouterView'],
        queryKeys: [],
      };

      const result = generateAotBarrel(compiledFiles, routeMap, appEntry);
      const fileKeys = Object.keys(result.files);
      const appFile = result.files[fileKeys[0]!]!;

      // Should contain the __ssr_App function
      expect(appFile).toContain('__ssr_App');
      // Should NOT contain original imports or side effects
      expect(appFile).not.toContain('import { RouterView');
      expect(appFile).not.toContain('import { routes }');
      expect(appFile).not.toContain('createRouter');
      expect(appFile).not.toContain('var router');
    });

    it('Then compiled files with multiple __ssr_* functions extract all of them', () => {
      const compiledFiles: Record<string, AotCompiledFile> = {
        'pages.tsx': {
          code: [
            'import { query } from "@vertz/ui";',
            'function HomePage() { const tasks = query(() => fetch("/api")); return <div>{tasks.data}</div>; }',
            'function AboutPage() { return <div>About</div>; }',
            'export function __ssr_HomePage(data, ctx) { return "<div>" + __esc(ctx.getData("tasks-list")) + "</div>"; }',
            'export function __ssr_AboutPage() { return "<div>About</div>"; }',
          ].join('\n'),
          components: [
            { name: 'HomePage', tier: 'data-driven', holes: [], queryKeys: ['tasks-list'] },
            { name: 'AboutPage', tier: 'static', holes: [], queryKeys: [] },
          ],
        },
      };
      const routeMap: Record<string, AotRouteMapEntry> = {
        '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: ['tasks-list'] },
        '/about': { renderFn: '__ssr_AboutPage', holes: [], queryKeys: [] },
      };

      const result = generateAotBarrel(compiledFiles, routeMap);
      const fileKeys = Object.keys(result.files);
      const pagesFile = result.files[fileKeys[0]!]!;

      // Both functions extracted
      expect(pagesFile).toContain('__ssr_HomePage');
      expect(pagesFile).toContain('__ssr_AboutPage');
      // Original source excluded
      expect(pagesFile).not.toContain('import { query }');
      expect(pagesFile).not.toContain('function HomePage()');
    });
  });
});

describe('attachPerRouteCss', () => {
  it('attaches CSS rules whose class names appear in the __ssr_* function code', () => {
    const compiledFiles: Record<string, AotCompiledFile> = {
      'src/page.tsx': {
        code: `
original source code...
export function __ssr_Page(data: Record<string, unknown>, ctx: any): string {
  return '<div class="_aabb1122"><h1 class="_ccdd3344">Hello</h1></div>';
}`,
        components: [{ name: 'Page', tier: 'static', holes: [], queryKeys: [] }],
        css: [
          '._aabb1122 {\n  padding: 1rem;\n}',
          '._ccdd3344 {\n  font-size: 1.5rem;\n}',
          '._eeff5566 {\n  margin: 2rem;\n}', // not referenced in __ssr_Page
        ],
      },
    };

    const routeMap: Record<string, AotRouteMapEntry> = {
      '/': { renderFn: '__ssr_Page', holes: [], queryKeys: [] },
    };

    attachPerRouteCss(compiledFiles, routeMap);

    expect(routeMap['/']!.css).toBeDefined();
    expect(routeMap['/']!.css).toHaveLength(2);
    expect(routeMap['/']!.css).toContain('._aabb1122 {\n  padding: 1rem;\n}');
    expect(routeMap['/']!.css).toContain('._ccdd3344 {\n  font-size: 1.5rem;\n}');
    // Dead CSS not included
    expect(routeMap['/']!.css).not.toContain('._eeff5566');
  });

  it('attaches app CSS separately from route CSS', () => {
    const compiledFiles: Record<string, AotCompiledFile> = {
      'src/app.tsx': {
        code: `
export function __ssr_App(data: Record<string, unknown>, ctx: any): string {
  return '<div class="_aa001111">' + ctx.holes.RouterView() + '</div>';
}`,
        components: [{ name: 'App', tier: 'static', holes: ['RouterView'], queryKeys: [] }],
        css: ['._aa001111 {\n  display: flex;\n}'],
      },
      'src/home.tsx': {
        code: `
export function __ssr_Home(data: Record<string, unknown>, ctx: any): string {
  return '<main class="_bb002222">Welcome</main>';
}`,
        components: [{ name: 'Home', tier: 'static', holes: [], queryKeys: [] }],
        css: ['._bb002222 {\n  padding: 2rem;\n}'],
      },
    };

    const routeMap: Record<string, AotRouteMapEntry> = {
      '/': { renderFn: '__ssr_Home', holes: [], queryKeys: [] },
    };

    const appEntry: AotRouteMapEntry = {
      renderFn: '__ssr_App',
      holes: ['RouterView'],
      queryKeys: [],
    };

    attachPerRouteCss(compiledFiles, routeMap, appEntry);

    // App entry gets its own CSS
    expect(appEntry.css).toEqual(['._aa001111 {\n  display: flex;\n}']);

    // Route gets only its own CSS (app CSS merged at runtime)
    expect(routeMap['/']!.css).toEqual(['._bb002222 {\n  padding: 2rem;\n}']);
  });

  it('includes CSS from local child components called via __ssr_*', () => {
    const compiledFiles: Record<string, AotCompiledFile> = {
      'src/page.tsx': {
        code: `
export function __ssr_TaskCard(props: any): string {
  return '<div class="_ca2d1234">' + props.title + '</div>';
}

export function __ssr_HomePage(data: Record<string, unknown>, ctx: any): string {
  return '<main class="_da0e5678">' + __ssr_TaskCard({ title: 'Test' }) + '</main>';
}`,
        components: [
          { name: 'TaskCard', tier: 'static', holes: [], queryKeys: [] },
          { name: 'HomePage', tier: 'static', holes: [], queryKeys: [] },
        ],
        css: [
          '._ca2d1234 {\n  border: 1px solid;\n}',
          '._da0e5678 {\n  padding: 2rem;\n}',
        ],
      },
    };

    const routeMap: Record<string, AotRouteMapEntry> = {
      '/': { renderFn: '__ssr_HomePage', holes: [], queryKeys: [] },
    };

    attachPerRouteCss(compiledFiles, routeMap);

    // Should include CSS from both HomePage AND its child TaskCard
    expect(routeMap['/']!.css).toHaveLength(2);
    expect(routeMap['/']!.css).toContain('._da0e5678 {\n  padding: 2rem;\n}');
    expect(routeMap['/']!.css).toContain('._ca2d1234 {\n  border: 1px solid;\n}');
  });

  it('includes CSS from hole components (imported from other files)', () => {
    const compiledFiles: Record<string, AotCompiledFile> = {
      'src/page.tsx': {
        code: `
export function __ssr_HomePage(data: Record<string, unknown>, ctx: any): string {
  return '<main class="_ab001234">' + ctx.holes.Sidebar() + '</main>';
}`,
        components: [
          { name: 'HomePage', tier: 'static', holes: ['Sidebar'], queryKeys: [] },
        ],
        css: ['._ab001234 {\n  display: grid;\n}'],
      },
      'src/sidebar.tsx': {
        code: `
export function __ssr_Sidebar(data: Record<string, unknown>, ctx: any): string {
  return '<aside class="_cd005678">Nav</aside>';
}`,
        components: [
          { name: 'Sidebar', tier: 'static', holes: [], queryKeys: [] },
        ],
        css: ['._cd005678 {\n  width: 250px;\n}'],
      },
    };

    const routeMap: Record<string, AotRouteMapEntry> = {
      '/': { renderFn: '__ssr_HomePage', holes: ['Sidebar'], queryKeys: [] },
    };

    attachPerRouteCss(compiledFiles, routeMap);

    // Should include CSS from both HomePage AND its hole Sidebar
    expect(routeMap['/']!.css).toHaveLength(2);
    expect(routeMap['/']!.css).toContain('._ab001234 {\n  display: grid;\n}');
    expect(routeMap['/']!.css).toContain('._cd005678 {\n  width: 250px;\n}');
  });

  it('skips routes with no matching CSS', () => {
    const compiledFiles: Record<string, AotCompiledFile> = {
      'src/plain.tsx': {
        code: `
export function __ssr_Plain(data: Record<string, unknown>, ctx: any): string {
  return '<div>No CSS</div>';
}`,
        components: [{ name: 'Plain', tier: 'static', holes: [], queryKeys: [] }],
        // No CSS
      },
    };

    const routeMap: Record<string, AotRouteMapEntry> = {
      '/plain': { renderFn: '__ssr_Plain', holes: [], queryKeys: [] },
    };

    attachPerRouteCss(compiledFiles, routeMap);

    expect(routeMap['/plain']!.css).toBeUndefined();
  });
});
