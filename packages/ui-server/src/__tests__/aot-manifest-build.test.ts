import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AotBuildComponentEntry,
  AotCompiledFile,
  AotRouteMapEntry,
} from '../aot-manifest-build';
import {
  buildAotRouteMap,
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
        expect(fileKeys[0]).toMatch(/^__aot_\d+_home\.tsx$/);
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
        for (const [fileName, code] of Object.entries(result.files)) {
          expect(code).toContain(helperImport);
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
});
