import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateAotBuildManifest } from '../aot-manifest-build';

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
});
