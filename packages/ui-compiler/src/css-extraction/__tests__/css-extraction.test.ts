import { describe, expect, it } from 'bun:test';
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

  it('extracts CSS declaration objects in nested selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: ['p:4', { '&:hover': [{ 'background-color': 'color-mix(in oklch, var(--color-primary) 90%, transparent)' }] }] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toContain(
      'background-color: color-mix(in oklch, var(--color-primary) 90%, transparent)',
    );
    expect(result.css).toContain(':hover');
  });

  it('mixes CSS declaration objects with shorthands in nested selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4', { '[data-theme="dark"] &': ['text:foreground', { 'background-color': 'rgba(0,0,0,0.3)' }] }] });`;
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

  it('extracts nested selector with only CSS declaration objects (no shorthands)', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ overlay: ['fixed', { '&': [{ 'background-color': 'oklch(0 0 0 / 50%)' }] }] });`;
    const result = extractor.extract(source, 'Dialog.tsx');

    expect(result.css).toContain('background-color: oklch(0 0 0 / 50%)');
    expect(result.css).toContain('position: fixed');
  });

  it('extracts multiple CSS properties in a single declaration object', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: [{ '&:focus-visible': [{ outline: '3px solid blue', 'outline-offset': '2px' }] }] });`;
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

  it('skips css() calls with dynamic values as reactive', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: ['p:4', { '&:hover': [{ color: someVar }] }] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toBe('');
    expect(result.blockNames).toEqual([]);
  });

  it('extracts CSS declaration objects alongside keywords in nested selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: [{ '&:disabled': ['pointer-events-none', 'opacity:0.5'] }, { '&:hover': [{ 'background-color': 'color-mix(in oklch, var(--color-primary) 90%, transparent)' }] }] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toContain('pointer-events: none');
    expect(result.css).toContain(':disabled');
    expect(result.css).toContain(
      'background-color: color-mix(in oklch, var(--color-primary) 90%, transparent)',
    );
    expect(result.css).toContain(':hover');
  });

  it('wraps @media at-rules around the class selector', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ grid: ['gap:4', { '@media (min-width: 768px)': ['grid-cols:2'] }] });`;
    const result = extractor.extract(source, 'Grid.tsx');

    expect(result.css).toContain('@media (min-width: 768px)');
    expect(result.css).toContain('grid-template-columns:');
    // The class selector must appear INSIDE the @media block
    expect(result.css).toMatch(/@media \(min-width: 768px\) \{\n\s+\._[a-f0-9]+ \{/);
  });

  it('resolves grid-cols:N to repeat(N, minmax(0, 1fr)) (#1993)', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ layout: ['grid', 'grid-cols:5'] });`;
    const result = extractor.extract(source, 'Grid.tsx');

    expect(result.css).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');
    // Must NOT output the raw number
    expect(result.css).not.toMatch(/grid-template-columns:\s*5[;\s]/);
  });

  it('wraps @container at-rules around the class selector', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4', { '@container (min-width: 400px)': ['p:8'] }] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('@container (min-width: 400px)');
    expect(result.css).toContain('padding: 2rem');
    // Class selector must be inside the @container block
    expect(result.css).toMatch(/@container \(min-width: 400px\) \{\n\s+\._[a-f0-9]+ \{/);
  });

  it('wraps @supports at-rules around the class selector', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ layout: ['flex', { '@supports (display: grid)': ['grid'] }] });`;
    const result = extractor.extract(source, 'Layout.tsx');

    expect(result.css).toContain('@supports (display: grid)');
    expect(result.css).toContain('display: grid');
    expect(result.css).toMatch(/@supports \(display: grid\) \{\n\s+\._[a-f0-9]+ \{/);
  });

  it('does not treat @-prefixed selectors as & selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ layout: ['flex', { '@media (min-width: 1024px)': ['flex-col'] }] });`;
    const result = extractor.extract(source, 'Layout.tsx');

    // Should NOT have the at-rule as a bare selector without a nested class
    expect(result.css).not.toMatch(/@media[^{]+\{\n\s+flex-direction/);
    // Should have proper nesting: @media { .class { declarations } }
    expect(result.css).toMatch(/@media[^{]+\{\n\s+\._[a-f0-9]+ \{\n\s+flex-direction/);
  });

  it('extracts direct object form for @media at-rules', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ grid: ['gap:4', { '@media (min-width: 768px)': { 'grid-template-columns': 'repeat(2, 1fr)' } }] });`;
    const result = extractor.extract(source, 'Grid.tsx');

    expect(result.css).toContain('@media (min-width: 768px)');
    expect(result.css).toContain('grid-template-columns: repeat(2, 1fr)');
    expect(result.css).toMatch(/@media \(min-width: 768px\) \{\n\s+\._[a-f0-9]+ \{/);
  });

  it('extracts CSS declaration objects inside nested arrays', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['p:4', { '&:hover': ['text:foreground', { 'background-color': 'rgba(0,0,0,0.3)' }] }] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('color: var(--color-foreground)');
    expect(result.css).toContain('background-color: rgba(0,0,0,0.3)');
    expect(result.css).toContain(':hover');
  });

  it('extracts direct object form for pseudo selectors', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: ['p:4', { '&:hover': { opacity: '1' } }] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toContain('opacity: 1');
    expect(result.css).toContain(':hover');
  });

  it('handles 2-segment pseudo:property shorthand', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: ['hover:flex'] });`;
    const result = extractor.extract(source, 'Button.tsx');

    expect(result.css).toContain(':hover');
    expect(result.css).toContain('display: flex');
  });

  it('skips 3-segment shorthand with invalid pseudo prefix', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ btn: ['notpseudo:bg:primary'] });`;
    const result = extractor.extract(source, 'Button.tsx');

    // Invalid 3-segment shorthand should not produce CSS
    expect(result.css).not.toContain('background-color');
  });

  it('extracts radius value type', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['rounded:lg'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('border-radius:');
  });

  it('extracts alignment value type', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['items:center'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('align-items: center');
  });

  it('extracts font-weight value type', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['weight:bold'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('font-weight:');
  });

  it('extracts line-height value type', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['leading:relaxed'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('line-height:');
  });

  it('extracts ring value type', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ input: ['ring:2'] });`;
    const result = extractor.extract(source, 'Input.tsx');

    expect(result.css).toContain('2px solid var(--color-ring)');
  });

  it('extracts size:screen shorthand', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ panel: ['w:screen'] });`;
    const result = extractor.extract(source, 'Panel.tsx');

    expect(result.css).toContain('100vw');
  });

  it('resolves size keywords', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ panel: ['w:full'] });`;
    const result = extractor.extract(source, 'Panel.tsx');

    expect(result.css).toContain('100%');
  });

  it('passes through CSS keyword colors (transparent)', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['bg:transparent'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('transparent');
  });

  it('returns null for unknown color namespace with shade', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['bg:fake.500'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    // Unknown namespace should not produce valid color CSS
    expect(result.css).not.toContain('var(--color-fake');
  });

  it('returns null for unknown color without dot', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['bg:potato'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).not.toContain('potato');
  });

  it('extracts content value type', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['justify:center'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('justify-content: center');
  });

  it('extracts overflow axis variants', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ panel: ['overflow-x:auto', 'overflow-y:hidden'] });`;
    const result = extractor.extract(source, 'Panel.tsx');

    expect(result.css).toContain('overflow-x: auto');
    expect(result.css).toContain('overflow-y: hidden');
  });

  it('extracts scale keywords', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['scale-110'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain('transform: scale(1.1)');
  });

  it('extracts fraction dimensions', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ sidebar: ['w:1/2'], main: ['w:2/3'] });`;
    const result = extractor.extract(source, 'Layout.tsx');

    expect(result.css).toContain('width: 50%');
    expect(result.css).toContain('width: 66.666667%');
  });

  it('extracts color opacity modifier', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ overlay: ['bg:primary/50'] });`;
    const result = extractor.extract(source, 'Overlay.tsx');

    expect(result.css).toContain(
      'background-color: color-mix(in oklch, var(--color-primary) 50%, transparent)',
    );
  });

  it('extracts shaded color with opacity modifier', () => {
    const extractor = new CSSExtractor();
    const source = `const s = css({ card: ['bg:primary.700/30'] });`;
    const result = extractor.extract(source, 'Card.tsx');

    expect(result.css).toContain(
      'background-color: color-mix(in oklch, var(--color-primary-700) 30%, transparent)',
    );
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

  it('returns empty snapshot when no files registered', () => {
    const hmr = new CSSHMRHandler();
    expect(hmr.getSnapshot()).toBe('');
  });

  it('excludes empty CSS entries from snapshot', () => {
    const hmr = new CSSHMRHandler();
    hmr.register('Card.tsx', '.card { padding: 1rem; }');
    hmr.register('Empty.tsx', '');
    const snapshot = hmr.getSnapshot();
    expect(snapshot).toContain('.card');
    expect(snapshot).not.toContain('\n\n');
  });

  it('tracks file count with size getter', () => {
    const hmr = new CSSHMRHandler();
    expect(hmr.size).toBe(0);

    hmr.register('Card.tsx', '.card {}');
    expect(hmr.size).toBe(1);

    hmr.register('Button.tsx', '.btn {}');
    expect(hmr.size).toBe(2);
  });

  it('clears all tracked state', () => {
    const hmr = new CSSHMRHandler();
    hmr.register('Card.tsx', '.card {}');
    hmr.register('Button.tsx', '.btn {}');

    hmr.clear();
    expect(hmr.size).toBe(0);
    expect(hmr.getSnapshot()).toBe('');
  });
});
