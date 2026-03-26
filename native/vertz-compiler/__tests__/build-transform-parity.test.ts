/**
 * Phase 6: Cross-compiler parity tests for build-time transforms.
 *
 * Compares the native Rust compiler's build-time transforms against the
 * TypeScript (ts-morph) equivalents. Each transform must produce
 * semantically equivalent output.
 *
 * Covers: Route splitting, hydration markers, field selection,
 * prefetch manifest, and AOT string-builder SSR.
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// TS compiler imports
import {
  compileForSSRAot as tsCompileForSSRAot,
  transformRouteSplitting as tsTransformRouteSplitting,
  extractRoutes as tsExtractRoutes,
  analyzeComponentQueries as tsAnalyzeComponentQueries,
} from '@vertz/ui-compiler';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

interface NapiCompileResult {
  code: string;
  css?: string;
  map?: string;
  diagnostics?: Array<{ message: string; line?: number; column?: number }>;
  components?: Array<{
    name: string;
    bodyStart: number;
    bodyEnd: number;
    variables?: Array<{
      name: string;
      kind: string;
      start: number;
      end: number;
      signalProperties?: string[];
      plainProperties?: string[];
    }>;
  }>;
  hydrationIds?: string[];
  fieldSelections?: Array<{
    queryVar: string;
    injectionPos: number;
    injectionKind: string;
    fields: string[];
    hasOpaqueAccess: boolean;
    nestedAccess: Array<{ field: string; nestedPath: string[] }>;
    inferredEntityName?: string;
  }>;
  extractedRoutes?: Array<{
    pattern: string;
    componentName: string;
    routeType: string;
  }>;
  extractedQueries?: Array<{
    descriptorChain: string;
    entity?: string;
    operation?: string;
    idParam?: string;
  }>;
  routeParams?: string[];
}

interface NapiAotResult {
  code: string;
  components: Array<{
    name: string;
    tier: string;
    holes: string[];
    queryKeys: string[];
  }>;
}

function loadNativeCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: {
        filename?: string;
        fastRefresh?: boolean;
        target?: string;
        hydrationMarkers?: boolean;
        routeSplitting?: boolean;
        fieldSelection?: boolean;
        prefetchManifest?: boolean;
      },
    ) => NapiCompileResult;
    compileForSsrAot: (
      source: string,
      options?: { filename?: string },
    ) => NapiAotResult;
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Route Splitting Parity
// ═══════════════════════════════════════════════════════════════════

describe('Build-time transform parity: Route splitting', () => {
  const routeSource = `
import { defineRoutes } from '@vertz/ui';
import { HomePage } from './pages/home-page';
import { SettingsPage } from './pages/settings';

export const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/settings': { component: () => <SettingsPage /> },
});
  `.trim();

  it('Both compilers convert static imports to dynamic imports', () => {
    const tsResult = tsTransformRouteSplitting(routeSource, 'src/router.tsx');
    const { compile } = loadNativeCompiler();
    const nativeResult = compile(routeSource, {
      filename: 'src/router.tsx',
      routeSplitting: true,
    });
    const nativeCode = nativeResult.code.replace(
      '// compiled by vertz-native\n',
      '',
    );

    // Both should have dynamic imports
    expect(tsResult.code).toContain('import(');
    expect(nativeCode).toContain('import(');

    // Both should remove static imports for route components
    expect(tsResult.code).not.toMatch(
      /^import\s+\{.*HomePage.*\}.*from/m,
    );
    expect(nativeCode).not.toMatch(/^import\s+\{.*HomePage.*\}.*from/m);
  });

  it('Both compilers preserve non-route imports', () => {
    const source = `
import { defineRoutes } from '@vertz/ui';
import { Layout } from './components/layout';
import { Dashboard } from './pages/dashboard';

function useTheme() { return 'dark'; }

export const routes = defineRoutes({
  '/': {
    component: () => <Layout />,
    children: {
      '/dashboard': { component: () => <Dashboard /> },
    },
  },
});
    `.trim();

    const tsResult = tsTransformRouteSplitting(source, 'src/router.tsx');
    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'src/router.tsx',
      routeSplitting: true,
    });
    const nativeCode = nativeResult.code.replace(
      '// compiled by vertz-native\n',
      '',
    );

    // defineRoutes import should be preserved in both
    expect(tsResult.code).toContain('defineRoutes');
    expect(nativeCode).toContain('defineRoutes');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Hydration Markers Parity
// ═══════════════════════════════════════════════════════════════════

describe('Build-time transform parity: Hydration markers', () => {
  it('Native compiler marks interactive components with data-v-id', () => {
    const source = `
function Counter() {
  let count = 0;
  return <div><span>{count}</span></div>;
}
    `.trim();

    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'counter.tsx',
      hydrationMarkers: true,
    });

    // Native should detect Counter as interactive (has let/signal)
    expect(nativeResult.hydrationIds).toContain('Counter');

    // Verify data-v-id injection in compiled code
    expect(nativeResult.code).toContain('data-v-id');
    expect(nativeResult.code).toContain('Counter');
  });

  it('Native compiler skips static components', () => {
    const source = `
function Header() {
  return <header><h1>Static Title</h1></header>;
}
    `.trim();

    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'header.tsx',
      hydrationMarkers: true,
    });

    // Static component should NOT be marked
    expect(nativeResult.hydrationIds ?? []).not.toContain('Header');
  });

  it('AOT SSR hydration markers match between compilers', () => {
    const source = `
function Counter() {
  let count = 0;
  return <div><span>{count}</span></div>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'counter.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, {
      filename: 'counter.tsx',
    });

    // Both should emit data-v-id in AOT function
    expect(tsResult.code).toContain('data-v-id');
    expect(nativeResult.code).toContain('data-v-id');

    // Both should emit <!--child--> markers for reactive expressions
    expect(tsResult.code).toContain('<!--child-->');
    expect(nativeResult.code).toContain('<!--child-->');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Field Selection — Native transform validation
// ═══════════════════════════════════════════════════════════════════
// Note: The TS analyzeFieldSelection() requires full-module context
// from the compilation pipeline and returns empty for standalone
// components. We validate native field selection independently.

describe('Build-time transform: Field selection (native)', () => {
  it('Native compiler extracts fields from query access', () => {
    const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(() => api.task.list());
  return (
    <ul>
      {tasks.data?.map(t => (
        <li>{t.title} - {t.status}</li>
      ))}
    </ul>
  );
}
    `.trim();

    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'tasks.tsx',
      fieldSelection: true,
    });

    expect(nativeResult.fieldSelections?.length).toBeGreaterThan(0);
    expect(nativeResult.fieldSelections![0].queryVar).toBe('tasks');

    const fields = [...nativeResult.fieldSelections![0].fields].sort();
    expect(fields).toContain('title');
    expect(fields).toContain('status');
  });

  it('Native compiler detects opaque access', () => {
    const source = `
import { query } from '@vertz/ui';

function TaskList() {
  const tasks = query(() => api.task.list());
  console.log(tasks.data);
  return <div>{tasks.data?.map(t => <span>{t.id}</span>)}</div>;
}
    `.trim();

    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'tasks.tsx',
      fieldSelection: true,
    });

    expect(nativeResult.fieldSelections![0].hasOpaqueAccess).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Prefetch Manifest Parity
// ═══════════════════════════════════════════════════════════════════

describe('Build-time transform parity: Prefetch manifest', () => {
  it('Both compilers extract the same routes from defineRoutes()', () => {
    const source = `
import { defineRoutes } from '@vertz/ui';
import { HomePage } from './pages/home-page';
import { SettingsPage } from './pages/settings';

export const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
  '/settings': { component: () => <SettingsPage /> },
});
    `.trim();

    const tsRoutes = tsExtractRoutes(source, 'src/router.tsx');
    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'src/router.tsx',
      prefetchManifest: true,
    });

    // Same number of routes
    expect(nativeResult.extractedRoutes?.length).toBe(tsRoutes.length);

    // Same route patterns
    const tsPatterns = tsRoutes.map((r) => r.pattern).sort();
    const nativePatterns = nativeResult
      .extractedRoutes!.map((r) => r.pattern)
      .sort();
    expect(nativePatterns).toEqual(tsPatterns);

    // Same component names
    const tsComponents = tsRoutes.map((r) => r.componentName).sort();
    const nativeComponents = nativeResult
      .extractedRoutes!.map((r) => r.componentName)
      .sort();
    expect(nativeComponents).toEqual(tsComponents);
  });

  it('Both compilers extract nested routes', () => {
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
    `.trim();

    const tsRoutes = tsExtractRoutes(source, 'src/router.tsx');
    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'src/router.tsx',
      prefetchManifest: true,
    });

    // Both should extract 3 routes (layout + 2 pages)
    expect(tsRoutes.length).toBe(3);
    expect(nativeResult.extractedRoutes?.length).toBe(3);

    // Layout route should have type 'layout'
    const tsLayout = tsRoutes.find((r) => r.pattern === '/');
    const nativeLayout = nativeResult.extractedRoutes!.find(
      (r) => r.pattern === '/',
    );
    expect(tsLayout?.type).toBe('layout');
    expect(nativeLayout?.routeType).toBe('layout');
  });

  it('Both compilers extract query metadata from components', () => {
    const source = `
import { query, useParams } from '@vertz/ui';
import { api } from '../api';

export function ProjectLayout() {
  const { projectId } = useParams();
  const project = query(api.projects.get(projectId));
  return <div>{project.data}</div>;
}
    `.trim();

    const tsResult = tsAnalyzeComponentQueries(source, 'src/layout.tsx');
    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'src/layout.tsx',
      prefetchManifest: true,
    });

    // TS returns { queries, params }
    expect(tsResult.queries.length).toBeGreaterThan(0);
    expect(nativeResult.extractedQueries?.length).toBeGreaterThan(0);

    // Same entity/operation
    expect(tsResult.queries[0].entity).toBe('projects');
    expect(nativeResult.extractedQueries![0].entity).toBe('projects');

    expect(tsResult.queries[0].operation).toBe('get');
    expect(nativeResult.extractedQueries![0].operation).toBe('get');
  });

  it('Both compilers extract route params from patterns', () => {
    const source = `
import { defineRoutes } from '@vertz/ui';
import { ProjectPage } from './pages/project';

export const routes = defineRoutes({
  '/projects/:projectId': { component: () => <ProjectPage /> },
});
    `.trim();

    const tsRoutes = tsExtractRoutes(source, 'src/router.tsx');
    const { compile } = loadNativeCompiler();
    const nativeResult = compile(source, {
      filename: 'src/router.tsx',
      prefetchManifest: true,
    });

    // Both detect the route with :projectId
    const tsPattern = tsRoutes.find((r) =>
      r.pattern.includes(':projectId'),
    );
    expect(tsPattern).toBeDefined();

    const nativePattern = nativeResult.extractedRoutes?.find((r) =>
      r.pattern.includes(':projectId'),
    );
    expect(nativePattern).toBeDefined();

    // Native extracts route params separately
    expect(nativeResult.routeParams ?? []).toContain('projectId');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. AOT String-Builder SSR Parity
// ═══════════════════════════════════════════════════════════════════

describe('Build-time transform parity: AOT SSR', () => {
  /** SSR runtime helpers */
  const __esc = (value: unknown): string => {
    if (value == null || value === false) return '';
    if (Array.isArray(value)) return value.map((v) => __esc(v)).join('');
    const s = String(value);
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  const __esc_attr = __esc;
  const __ssr_spread = (obj: Record<string, unknown>): string => {
    return Object.entries(obj)
      .map(([k, v]) => ` ${k}="${__esc_attr(v)}"`)
      .join('');
  };
  const __ssr_style_object = (obj: Record<string, unknown>): string => {
    return Object.entries(obj)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => {
        const cssKey = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
        return `${cssKey}: ${v}`;
      })
      .join('; ');
  };

  /** Extract all __ssr_* function bodies using brace counting (handles nested braces). */
  function extractSsrFunctions(code: string): string[] {
    const fns: string[] = [];
    const funcPattern = /(?:export\s+)?function\s+__ssr_\w+\s*\([^)]*\)(?:\s*:\s*\w+)?\s*\{/g;
    let match;
    while ((match = funcPattern.exec(code)) !== null) {
      const start = match.index;
      const braceStart = code.indexOf('{', start + match[0].length - 1);
      let depth = 1;
      let i = braceStart + 1;
      while (i < code.length && depth > 0) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}') depth--;
        i++;
      }
      let fn = code.substring(start, i);
      // Strip export and TS return type annotation for JS eval
      fn = fn.replace(/^export\s+/, '').replace(/\)\s*:\s*\w+\s*\{/, ') {');
      fns.push(fn);
    }
    return fns;
  }

  function evalAotFn(
    code: string,
    fnName: string,
    args: Record<string, unknown> = {},
  ): string {
    const fns = extractSsrFunctions(code);
    const aotCode = fns.join('\n');
    const argNames = Object.keys(args);
    const argValues = Object.values(args);

    const wrapper = new Function(
      '__esc',
      '__esc_attr',
      '__ssr_spread',
      '__ssr_style_object',
      ...argNames,
      `${aotCode}\nreturn ${fnName};`,
    );
    const fn = wrapper(
      __esc,
      __esc_attr,
      __ssr_spread,
      __ssr_style_object,
      ...argValues,
    );
    return fn(...argValues);
  }

  it('Static components: same tier and HTML output', () => {
    const source = `
function Card() {
  return <div class="card"><h2>Title</h2><p>Body</p></div>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'card.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, { filename: 'card.tsx' });

    // Same tier classification
    expect(tsResult.components[0].tier).toBe('static');
    expect(nativeResult.components[0].tier).toBe('static');

    // Same HTML output
    const tsHtml = evalAotFn(tsResult.code, '__ssr_Card');
    const nativeHtml = evalAotFn(nativeResult.code, '__ssr_Card');
    expect(nativeHtml).toBe(tsHtml);
  });

  it('Data-driven components: same tier and escaped output', () => {
    const source = `
function Greeting({ name }: { name: string }) {
  return <div class="greeting">Hello, {name}!</div>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'greeting.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, {
      filename: 'greeting.tsx',
    });

    expect(tsResult.components[0].tier).toBe('data-driven');
    expect(nativeResult.components[0].tier).toBe('data-driven');

    // Same HTML with escaping
    const tsHtml = evalAotFn(tsResult.code, '__ssr_Greeting', {
      __props: { name: 'World' },
    });
    const nativeHtml = evalAotFn(nativeResult.code, '__ssr_Greeting', {
      __props: { name: 'World' },
    });
    expect(nativeHtml).toBe(tsHtml);
  });

  it('Conditional components: same tier and conditional markers', () => {
    const source = `
function Toggle({ show }: { show: boolean }) {
  return <div>{show ? <span>Visible</span> : <span>Hidden</span>}</div>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'toggle.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, {
      filename: 'toggle.tsx',
    });

    expect(tsResult.components[0].tier).toBe('conditional');
    expect(nativeResult.components[0].tier).toBe('conditional');

    // Both should have conditional markers
    const tsHtml = evalAotFn(tsResult.code, '__ssr_Toggle', {
      __props: { show: true },
    });
    const nativeHtml = evalAotFn(nativeResult.code, '__ssr_Toggle', {
      __props: { show: true },
    });
    expect(tsHtml).toContain('<!--conditional-->');
    expect(nativeHtml).toContain('<!--conditional-->');
    expect(nativeHtml).toBe(tsHtml);
  });

  it('Void elements: same self-closing output', () => {
    const source = `
function Form() {
  return <form><input type="text" /><br /><hr /></form>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'form.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, {
      filename: 'form.tsx',
    });

    const tsHtml = evalAotFn(tsResult.code, '__ssr_Form');
    const nativeHtml = evalAotFn(nativeResult.code, '__ssr_Form');
    expect(nativeHtml).toBe(tsHtml);

    // Void elements: no closing tags
    expect(nativeHtml).not.toContain('</input>');
    expect(nativeHtml).not.toContain('</br>');
  });

  it('Component holes: same hole detection', () => {
    const source = `
function Page({ title }: { title: string }) {
  return <div><Header title={title} /><Footer /></div>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'page.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, {
      filename: 'page.tsx',
    });

    const tsHoles = [...tsResult.components[0].holes].sort();
    const nativeHoles = [...nativeResult.components[0].holes].sort();
    expect(nativeHoles).toEqual(tsHoles);
    expect(nativeHoles).toContain('Header');
    expect(nativeHoles).toContain('Footer');
  });

  it('Guard patterns: same conditional output', () => {
    const source = `
function Page({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  return <div>Content</div>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'page.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, {
      filename: 'page.tsx',
    });

    expect(tsResult.components[0].tier).toBe('conditional');
    expect(nativeResult.components[0].tier).toBe('conditional');

    // Same HTML for guard-true case
    const tsHtml = evalAotFn(tsResult.code, '__ssr_Page', {
      __props: { loading: true, error: null },
    });
    const nativeHtml = evalAotFn(nativeResult.code, '__ssr_Page', {
      __props: { loading: true, error: null },
    });
    expect(nativeHtml).toBe(tsHtml);
    expect(nativeHtml).toContain('Loading...');
  });

  it('@vertz-no-aot pragma: both return runtime-fallback', () => {
    const source = `
// @vertz-no-aot
function Complex() {
  return <div>Content</div>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'complex.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, {
      filename: 'complex.tsx',
    });

    expect(tsResult.components[0].tier).toBe('runtime-fallback');
    expect(nativeResult.components[0].tier).toBe('runtime-fallback');
  });

  it('Boolean attributes: same conditional presence', () => {
    const source = `
function Input({ disabled }: { disabled: boolean }) {
  return <input type="text" disabled={disabled} />;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'input.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, {
      filename: 'input.tsx',
    });

    // Both should conditionally render the disabled attribute
    const tsHtml = evalAotFn(tsResult.code, '__ssr_Input', {
      __props: { disabled: true },
    });
    const nativeHtml = evalAotFn(nativeResult.code, '__ssr_Input', {
      __props: { disabled: true },
    });
    expect(nativeHtml).toBe(tsHtml);
    expect(nativeHtml).toContain('disabled');

    const tsHtmlFalse = evalAotFn(tsResult.code, '__ssr_Input', {
      __props: { disabled: false },
    });
    const nativeHtmlFalse = evalAotFn(nativeResult.code, '__ssr_Input', {
      __props: { disabled: false },
    });
    expect(nativeHtmlFalse).toBe(tsHtmlFalse);
    expect(nativeHtmlFalse).not.toContain('disabled');
  });

  it('Style objects: same style string output', () => {
    const source = `
function Box({ width }: { width: number }) {
  return <div style={{ width: width + 'px', backgroundColor: 'red' }}>box</div>;
}
    `.trim();

    const tsResult = tsCompileForSSRAot(source, 'box.tsx');
    const { compileForSsrAot } = loadNativeCompiler();
    const nativeResult = compileForSsrAot(source, { filename: 'box.tsx' });

    const tsHtml = evalAotFn(tsResult.code, '__ssr_Box', {
      __props: { width: 100 },
    });
    const nativeHtml = evalAotFn(nativeResult.code, '__ssr_Box', {
      __props: { width: 100 },
    });
    expect(nativeHtml).toBe(tsHtml);
    expect(nativeHtml).toContain('background-color: red');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Combined pipeline — all transforms enabled
// ═══════════════════════════════════════════════════════════════════

describe('Build-time transform parity: Combined pipeline', () => {
  it('All build-time flags can be enabled simultaneously on compile()', () => {
    const source = `
import { defineRoutes } from '@vertz/ui';
import { query } from '@vertz/ui';
import { HomePage } from './pages/home-page';

function HomePage() {
  let count = 0;
  const tasks = query(() => api.task.list());
  return (
    <div>
      <h1>{count}</h1>
      <ul>{tasks.data?.map(t => <li>{t.title}</li>)}</ul>
    </div>
  );
}

export const routes = defineRoutes({
  '/': { component: () => <HomePage /> },
});
    `.trim();

    const { compile } = loadNativeCompiler();
    const result = compile(source, {
      filename: 'src/app.tsx',
      hydrationMarkers: true,
      routeSplitting: true,
      fieldSelection: true,
      prefetchManifest: true,
    });

    // Should compile without errors
    expect(result.code).toBeTruthy();

    // Hydration markers detected
    expect(result.hydrationIds).toContain('HomePage');

    // Route splitting applied
    expect(result.code).toContain('import(');

    // Prefetch manifest routes extracted
    expect(result.extractedRoutes?.length).toBeGreaterThan(0);
  });
});

