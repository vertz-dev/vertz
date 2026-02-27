import { describe, expect, it } from 'vitest';
import { CSSCodeSplitter } from '../code-splitting';
import { DeadCSSEliminator } from '../dead-css';
import { CSSExtractor } from '../extractor';
import { CSSHMRHandler } from '../hmr';
import { RouteCSSManifest } from '../route-css-manifest';

// ─── Test Helpers ──────────────────────────────────────────────

/**
 * Simulate a mini build pipeline: parse files -> extract css() -> eliminate dead CSS.
 * Does NOT run a real Vite build.
 */
function buildProject(files: Record<string, string>): { cssBundle: string } {
  const extractor = new CSSExtractor();
  const eliminator = new DeadCSSEliminator();

  // 1. Extract CSS from all files
  const allExtractions = new Map<string, { css: string; blockNames: string[] }>();
  for (const [filePath, source] of Object.entries(files)) {
    const result = extractor.extract(source, filePath);
    allExtractions.set(filePath, result);
  }

  // 2. Build a set of used identifiers from the module graph
  // Simple heuristic: scan imports to figure out which modules are used
  const usedFiles = new Set<string>();
  for (const [filePath, source] of Object.entries(files)) {
    // Always include the entry point (App.tsx)
    if (filePath === 'App.tsx') {
      usedFiles.add(filePath);
    }

    // Find imports: import { X } from './Y'
    const importRegex = /import\s+\{[^}]+\}\s+from\s+['"]\.\/([^'"]+)['"]/g;
    let match: RegExpExecArray | null = importRegex.exec(source);
    while (match !== null) {
      const imported = match[1];
      // Only add if this file is itself used (reachable from App.tsx)
      if (usedFiles.has(filePath)) {
        const resolvedPath = imported.endsWith('.tsx') ? imported : `${imported}.tsx`;
        usedFiles.add(resolvedPath);
      }
      match = importRegex.exec(source);
    }
  }

  // 3. Eliminate dead CSS
  const allCSS: string[] = [];
  for (const [filePath, extraction] of allExtractions) {
    if (usedFiles.has(filePath)) {
      allCSS.push(extraction.css);
    }
  }

  const liveCSS = eliminator.eliminate(allExtractions, usedFiles);

  return { cssBundle: liveCSS };
}

interface RouteConfig {
  component: string;
  styles: string[];
}

/**
 * Simulate a build with routes: parse -> extract -> split by route.
 */
function buildProjectWithRoutes(routes: Record<string, RouteConfig>): {
  routeCSS: Record<string, string>;
} {
  const extractor = new CSSExtractor();
  const manifestBuilder = new RouteCSSManifest();
  const splitter = new CSSCodeSplitter();

  // Generate component source from route config
  const fileExtractions = new Map<string, { css: string; blockNames: string[] }>();
  const routeToFiles = new Map<string, string[]>();

  for (const [route, config] of Object.entries(routes)) {
    const componentName = config.component.replace('.tsx', '');
    const source = `const s = css({ root: [${config.styles.map((s) => `'${s}'`).join(', ')}] });
export function ${componentName}() { return <div class={s.root} />; }`;

    const result = extractor.extract(source, config.component);
    fileExtractions.set(config.component, result);
    routeToFiles.set(route, [config.component]);
  }

  // Build manifest
  const manifest = manifestBuilder.build(routeToFiles, fileExtractions);

  // Split CSS
  const routeCSS = splitter.split(manifest, fileExtractions);

  return { routeCSS };
}

// ─── Extractor Tests ───────────────────────────────────────────

describe('CSSExtractor', () => {
  it('extracts CSS from a simple css() call', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4', 'bg:background'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('background-color: var(--color-background)');
    expect(result.blockNames).toContain('card');
  });

  it('extracts CSS from multiple blocks', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4'], title: ['font:xl'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('font-size: 1.25rem');
    expect(result.blockNames).toEqual(['card', 'title']);
  });

  it('handles pseudo-state prefixes', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: ['bg:primary', 'hover:bg:primary.700'] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toContain(':hover');
    expect(result.css).toContain('var(--color-primary-700)');
  });

  it('generates deterministic class names', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4'] });`;

    const result1 = extractor.extract(source, 'Card.tsx');
    const result2 = extractor.extract(source, 'Card.tsx');

    expect(result1.css).toBe(result2.css);
  });

  it('returns empty CSS for reactive calls', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: [dynamicVar] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toBe('');
    expect(result.blockNames).toEqual([]);
  });

  it('extracts display shorthands', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ layout: ['flex', 'gap:4'] });`;
    const result = extractor.extract(source, 'Layout.tsx');

    expect(result.css).toContain('display: flex');
    expect(result.css).toContain('gap: 1rem');
  });

  it('handles multiple css() calls in one file', () => {
    const extractor = new CSSExtractor();
    const source = `const card = css({ root: ['p:4'] });
const button = css({ root: ['m:2'] });`;
    const result = extractor.extract(source, 'Components.tsx');

    expect(result.css).toContain('padding: 1rem');
    expect(result.css).toContain('margin: 0.5rem');
  });

  it('extracts non-display keywords (relative, flex-col, uppercase, outline-none)', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ panel: ['relative', 'flex-col', 'uppercase', 'outline-none'] });`;
    const result = extractor.extract(source, 'Panel.tsx');

    expect(result.css).toContain('position: relative');
    expect(result.css).toContain('flex-direction: column');
    expect(result.css).toContain('text-transform: uppercase');
    expect(result.css).toContain('outline: none');
  });

  it('extracts raw declaration objects in nested selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: ['p:4', { '&:hover': [{ property: 'background-color', value: 'color-mix(in oklch, var(--color-primary) 90%, transparent)' }] }] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toContain(
      'background-color: color-mix(in oklch, var(--color-primary) 90%, transparent)',
    );
    expect(result.css).toContain(':hover');
  });

  it('mixes raw declarations with shorthands in nested selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4', { '[data-theme="dark"] &': ['text:foreground', { property: 'background-color', value: 'rgba(0,0,0,0.3)' }] }] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('color: var(--color-foreground)');
    expect(result.css).toContain('background-color: rgba(0,0,0,0.3)');
  });

  it('extracts non-display keywords in nested selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4', { '&:hover': ['relative', 'uppercase'] }] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('position: relative');
    expect(result.css).toContain('text-transform: uppercase');
  });

  it('replaces all & occurrences in compound selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4', { '[data-theme="dark"] &:hover': ['bg:primary'] }] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).not.toContain('&');
    expect(result.css).toContain('[data-theme="dark"]');
    expect(result.css).toContain(':hover');
  });

  it('extracts nested selector with only raw declarations (no shorthands)', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ overlay: ['fixed', { '&': [{ property: 'background-color', value: 'oklch(0 0 0 / 50%)' }] }] });`;
    const result = extractor.extract(source, 'Dialog.tsx');

    expect(result.css).toContain('background-color: oklch(0 0 0 / 50%)');
    expect(result.css).toContain('position: fixed');
  });

  it('extracts multiple raw declarations in a single nested selector', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: [{ '&:focus-visible': [{ property: 'outline', value: '3px solid blue' }, { property: 'outline-offset', value: '2px' }] }] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toContain('outline: 3px solid blue');
    expect(result.css).toContain('outline-offset: 2px');
    expect(result.css).toContain(':focus-visible');
  });

  it('extracts new keyword utilities (whitespace-nowrap, shrink-0, etc.)', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ tag: ['whitespace-nowrap', 'shrink-0', 'select-none', 'pointer-events-none', 'overflow-hidden'] });`;
    const result = extractor.extract(source, 'Tag.tsx');

    expect(result.css).toContain('white-space: nowrap');
    expect(result.css).toContain('flex-shrink: 0');
    expect(result.css).toContain('user-select: none');
    expect(result.css).toContain('pointer-events: none');
    expect(result.css).toContain('overflow: hidden');
  });

  it('extracts shadow:xs shorthand', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ input: ['shadow:xs'] });`;
    const result = extractor.extract(source, 'Input.tsx');

    expect(result.css).toContain('box-shadow:');
    expect(result.css).toContain('rgb(0 0 0 / 0.03)');
  });

  it('skips css() calls with invalid raw declarations as reactive', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: ['p:4', { '&:hover': [{ property: 'color', value: someVar }] }] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toBe('');
    expect(result.blockNames).toEqual([]);
  });

  it('extracts raw declarations alongside keywords in nested selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: [{ '&:disabled': ['pointer-events-none', 'opacity:0.5'] }, { '&:hover': [{ property: 'background-color', value: 'color-mix(in oklch, var(--color-primary) 90%, transparent)' }] }] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toContain('pointer-events: none');
    expect(result.css).toContain(':disabled');
    expect(result.css).toContain(
      'background-color: color-mix(in oklch, var(--color-primary) 90%, transparent)',
    );
    expect(result.css).toContain(':hover');
  });
});

// ─── Dead CSS Elimination Tests ────────────────────────────────

describe('DeadCSSEliminator', () => {
  it('IT-2D-1: styles from tree-shaken components are eliminated', () => {
    const { cssBundle } = buildProject({
      'App.tsx': `import { Card } from './Card'; function App() { return <Card />; }`,
      'Card.tsx': `const s = css({ card: ['p:4'] }); export function Card() { return <div class={s.card} />; }`,
      'Unused.tsx': `const s = css({ unused: ['m:8'] }); export function Unused() { return <div class={s.unused} />; }`,
    });
    expect(cssBundle).toContain('padding: 1rem');
    expect(cssBundle).not.toContain('margin: 2rem');
  });

  it('keeps CSS from all used modules', () => {
    const { cssBundle } = buildProject({
      'App.tsx': `import { Card } from './Card'; import { Button } from './Button'; function App() { return <div><Card /><Button /></div>; }`,
      'Card.tsx': `const s = css({ card: ['p:4'] }); export function Card() { return <div class={s.card} />; }`,
      'Button.tsx': `const s = css({ btn: ['m:2'] }); export function Button() { return <button class={s.btn} />; }`,
    });
    expect(cssBundle).toContain('padding: 1rem');
    expect(cssBundle).toContain('margin: 0.5rem');
  });

  it('eliminates all CSS when no modules are used', () => {
    const eliminator = new DeadCSSEliminator();
    const extractions = new Map([['Orphan.tsx', { css: '.x { color: red; }', blockNames: ['x'] }]]);
    const usedFiles = new Set<string>();
    const result = eliminator.eliminate(extractions, usedFiles);
    expect(result).toBe('');
  });
});

// ─── Route CSS Manifest Tests ──────────────────────────────────

describe('RouteCSSManifest', () => {
  it('maps routes to their CSS dependencies', () => {
    const extractor = new CSSExtractor();
    const manifestBuilder = new RouteCSSManifest();

    const homeCSS = extractor.extract(`const s = css({ hero: ['bg:primary'] });`, 'Home.tsx');
    const aboutCSS = extractor.extract(`const s = css({ about: ['bg:secondary'] });`, 'About.tsx');

    const fileExtractions = new Map([
      ['Home.tsx', homeCSS],
      ['About.tsx', aboutCSS],
    ]);
    const routeToFiles = new Map([
      ['/', ['Home.tsx']],
      ['/about', ['About.tsx']],
    ]);

    const manifest = manifestBuilder.build(routeToFiles, fileExtractions);

    expect(manifest.get('/')).toBeDefined();
    expect(manifest.get('/about')).toBeDefined();
    expect(manifest.get('/')?.length).toBeGreaterThan(0);
    expect(manifest.get('/about')?.length).toBeGreaterThan(0);
  });

  it('handles routes with multiple component files', () => {
    const extractor = new CSSExtractor();
    const manifestBuilder = new RouteCSSManifest();

    const headerCSS = extractor.extract(`const s = css({ header: ['p:4'] });`, 'Header.tsx');
    const heroCSS = extractor.extract(`const s = css({ hero: ['m:8'] });`, 'Hero.tsx');

    const fileExtractions = new Map([
      ['Header.tsx', headerCSS],
      ['Hero.tsx', heroCSS],
    ]);
    const routeToFiles = new Map([['/', ['Header.tsx', 'Hero.tsx']]]);

    const manifest = manifestBuilder.build(routeToFiles, fileExtractions);

    expect(manifest.get('/')?.length).toBe(2);
  });
});

// ─── CSS Code Splitting Tests ──────────────────────────────────

describe('CSSCodeSplitter', () => {
  it('IT-2D-2: CSS is split per route', () => {
    const { routeCSS } = buildProjectWithRoutes({
      '/': { component: 'Home.tsx', styles: ['bg:primary'] },
      '/about': { component: 'About.tsx', styles: ['bg:secondary'] },
    });
    expect(routeCSS['/']).not.toContain('var(--color-secondary)');
    expect(routeCSS['/about']).not.toContain('var(--color-primary)');
  });

  it('produces a common chunk for shared CSS', () => {
    const extractor = new CSSExtractor();
    const splitter = new CSSCodeSplitter();

    const sharedCSS = extractor.extract(`const s = css({ layout: ['flex'] });`, 'Layout.tsx');
    const homeCSS = extractor.extract(`const s = css({ hero: ['bg:primary'] });`, 'Home.tsx');
    const aboutCSS = extractor.extract(`const s = css({ about: ['bg:secondary'] });`, 'About.tsx');

    const fileExtractions = new Map([
      ['Layout.tsx', sharedCSS],
      ['Home.tsx', homeCSS],
      ['About.tsx', aboutCSS],
    ]);

    // Layout.tsx is used by both routes
    const manifest = new Map<string, string[]>([
      ['/', ['Layout.tsx', 'Home.tsx']],
      ['/about', ['Layout.tsx', 'About.tsx']],
    ]);

    const result = splitter.split(manifest, fileExtractions);

    // Common chunk should contain shared Layout CSS
    expect(result.__common).toBeDefined();
    expect(result.__common).toContain('display: flex');

    // Route-specific chunks should NOT contain the shared CSS
    expect(result['/']).not.toContain('display: flex');
    expect(result['/about']).not.toContain('display: flex');
  });

  it('each route only loads the CSS it needs', () => {
    const { routeCSS } = buildProjectWithRoutes({
      '/': { component: 'Home.tsx', styles: ['p:4'] },
      '/about': { component: 'About.tsx', styles: ['m:8'] },
    });

    expect(routeCSS['/']).toContain('padding: 1rem');
    expect(routeCSS['/']).not.toContain('margin: 2rem');

    expect(routeCSS['/about']).toContain('margin: 2rem');
    expect(routeCSS['/about']).not.toContain('padding: 1rem');
  });
});

// ─── CSS HMR Tests ─────────────────────────────────────────────

describe('CSSHMRHandler', () => {
  it('detects changes and returns affected CSS', () => {
    const hmr = new CSSHMRHandler();
    const extractor = new CSSExtractor();

    // Initial state
    const initial = extractor.extract(`const s = css({ card: ['p:4'] });`, 'Card.tsx');
    hmr.register('Card.tsx', initial.css);

    // Updated state
    const updated = extractor.extract(`const s = css({ card: ['p:8'] });`, 'Card.tsx');

    const result = hmr.update('Card.tsx', updated.css);

    expect(result.hasChanged).toBe(true);
    expect(result.css).toContain('padding: 2rem');
    expect(result.affectedFiles).toContain('Card.tsx');
  });

  it('returns no change when CSS is identical', () => {
    const hmr = new CSSHMRHandler();

    hmr.register('Card.tsx', '.card { padding: 1rem; }');
    const result = hmr.update('Card.tsx', '.card { padding: 1rem; }');

    expect(result.hasChanged).toBe(false);
  });

  it('tracks multiple files independently', () => {
    const hmr = new CSSHMRHandler();

    hmr.register('Card.tsx', '.card { padding: 1rem; }');
    hmr.register('Button.tsx', '.btn { margin: 0.5rem; }');

    // Only Card changes
    const result = hmr.update('Card.tsx', '.card { padding: 2rem; }');

    expect(result.hasChanged).toBe(true);
    expect(result.affectedFiles).toContain('Card.tsx');
    expect(result.affectedFiles).not.toContain('Button.tsx');
  });

  it('handles file removal', () => {
    const hmr = new CSSHMRHandler();

    hmr.register('Card.tsx', '.card { padding: 1rem; }');
    hmr.remove('Card.tsx');

    // Should not throw when updating a removed file
    const result = hmr.update('Card.tsx', '.card { padding: 2rem; }');
    expect(result.hasChanged).toBe(true);
  });

  it('provides full CSS snapshot for Vite HMR', () => {
    const hmr = new CSSHMRHandler();

    hmr.register('Card.tsx', '.card { padding: 1rem; }');
    hmr.register('Button.tsx', '.btn { margin: 0.5rem; }');

    const snapshot = hmr.getSnapshot();
    expect(snapshot).toContain('.card');
    expect(snapshot).toContain('.btn');
  });
});
