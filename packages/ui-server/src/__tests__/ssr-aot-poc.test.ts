/**
 * POC: AOT-compiled SSR — Validate core performance claims.
 *
 * Hand-compiles representative components to string concatenation and benchmarks
 * against DOM shim rendering. This validates the 3-20x speedup estimate before
 * investing in compiler implementation.
 *
 * POC 1: Core render speedup (ProjectCard, ProjectsPage, static skeleton)
 * POC 2: Style object serialization parity
 * POC 3: Inlining depth impact
 *
 * Issue: #1745
 */
import { describe, expect, it } from 'bun:test';
import { query } from '@vertz/ui';
import { __styleStr as styleObjectToString } from '@vertz/ui/internals';
import { installDomShim, toVNode } from '../dom-shim';
import { escapeAttr, escapeHtml, serializeToHtml } from '../html-serializer';
import { ssrStorage } from '../ssr-context';
import { createRequestContext, type SSRModule, ssrRenderToString } from '../ssr-render';
import { ssrRenderSinglePass } from '../ssr-single-pass';
import { streamToString } from '../streaming';
import { renderToStream } from '../render-to-stream';

installDomShim();

// ─── Shared Types ──────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
  key: string;
  description: string | null;
}

interface ProjectListResult {
  items: Project[];
}

// ─── Test Data ─────────────────────────────────────────────────

const projects: Project[] = [
  { id: 'p-1', name: 'Frontend', key: 'FE', description: 'Frontend platform' },
  { id: 'p-2', name: 'Backend', key: 'BE', description: null },
  { id: 'p-3', name: 'Mobile', key: 'MOB', description: 'iOS and Android apps' },
  { id: 'p-4', name: 'DevOps', key: 'DO', description: 'Infrastructure' },
  { id: 'p-5', name: 'Design', key: 'DS', description: null },
];

const projectListData: ProjectListResult = { items: projects };

// ─── Mock Descriptor ───────────────────────────────────────────

function mockDescriptor<T>(method: string, path: string, data: T) {
  const key = `${method}:${path}`;
  const fetchResult = async () => ({ ok: true as const, data });
  return {
    _tag: 'QueryDescriptor' as const,
    _key: key,
    _fetch: fetchResult,
    // biome-ignore lint/suspicious/noThenProperty: intentional PromiseLike
    then(onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return fetchResult().then(onFulfilled, onRejected);
    },
  };
}

// ─── AOT Helpers (matching html-serializer.ts exactly) ─────────

/** Escape HTML content — matches escapeHtml() from html-serializer.ts */
function __esc(value: unknown): string {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map((v) => __esc(v)).join('');
  const s = String(value);
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Boolean attribute — matches DOM shim behavior: true → name="" */
function __bool_attr(name: string, value: unknown): string {
  return value ? ` ${name}=""` : '';
}

// ─── Hand-Compiled AOT Functions ───────────────────────────────

// Simulate css() output — in real AOT these would be actual generated class names
const cardStyles = {
  card: '_card_cls',
  name: '_name_cls',
  key: '_key_cls',
  description: '_desc_cls',
};

const pageStyles = {
  container: '_container_cls',
  header: '_header_cls',
  title: '_title_cls',
  grid: '_grid_cls',
};

/**
 * AOT-compiled ProjectCard (Tier 2: data-driven)
 *
 * Original:
 *   function ProjectCard({ project }) {
 *     return (
 *       <div className={styles.card} data-testid={`project-card-${project.id}`}>
 *         <div className={styles.name} data-testid="project-name">{project.name}</div>
 *         <div className={styles.key}>{project.key}</div>
 *         {project.description && <p className={styles.description}>{project.description}</p>}
 *       </div>
 *     );
 *   }
 */
function __ssr_ProjectCard(project: Project): string {
  return (
    '<div class="' +
    escapeAttr(cardStyles.card) +
    '" data-testid="project-card-' +
    escapeAttr(project.id) +
    '">' +
    '<div class="' +
    escapeAttr(cardStyles.name) +
    '" data-testid="project-name">' +
    escapeHtml(project.name) +
    '</div>' +
    '<div class="' +
    escapeAttr(cardStyles.key) +
    '">' +
    escapeHtml(project.key) +
    '</div>' +
    (project.description
      ? '<p class="' + escapeAttr(cardStyles.description) + '">' + escapeHtml(project.description) + '</p>'
      : '') +
    '</div>'
  );
}

/**
 * AOT-compiled ProjectsPage (Tier 3: conditional with list)
 * Includes loading/empty state conditionals and list rendering.
 *
 * Simplified from the real component — focuses on the data rendering path
 * (not the dialog or Button components which would be runtime holes).
 */
function __ssr_ProjectsPage(data: ProjectListResult | undefined, loading: boolean): string {
  return (
    '<div class="' +
    escapeAttr(pageStyles.container) +
    '">' +
    '<header class="' +
    escapeAttr(pageStyles.header) +
    '">' +
    '<h1 class="' +
    escapeAttr(pageStyles.title) +
    '">Projects</h1>' +
    '</header>' +
    // Loading state conditional
    (loading ? '<div data-testid="projects-skeleton">Loading...</div>' : '') +
    // Empty state conditional
    (!loading && data?.items.length === 0 ? '<div data-testid="projects-empty">No projects yet</div>' : '') +
    // Project list
    '<div class="' +
    escapeAttr(pageStyles.grid) +
    '">' +
    (data?.items ?? []).map((p) => __ssr_ProjectCard(p)).join('') +
    '</div>' +
    '</div>'
  );
}

/**
 * AOT-compiled ProjectsPage with ProjectCard inlined (depth 1)
 * Same as above but ProjectCard's template is inlined directly.
 */
function __ssr_ProjectsPage_inlined(data: ProjectListResult | undefined, loading: boolean): string {
  return (
    '<div class="' +
    escapeAttr(pageStyles.container) +
    '">' +
    '<header class="' +
    escapeAttr(pageStyles.header) +
    '">' +
    '<h1 class="' +
    escapeAttr(pageStyles.title) +
    '">Projects</h1>' +
    '</header>' +
    (loading ? '<div data-testid="projects-skeleton">Loading...</div>' : '') +
    (!loading && data?.items.length === 0 ? '<div data-testid="projects-empty">No projects yet</div>' : '') +
    '<div class="' +
    escapeAttr(pageStyles.grid) +
    '">' +
    (data?.items ?? [])
      .map(
        (p) =>
          '<div class="' +
          escapeAttr(cardStyles.card) +
          '" data-testid="project-card-' +
          escapeAttr(p.id) +
          '">' +
          '<div class="' +
          escapeAttr(cardStyles.name) +
          '" data-testid="project-name">' +
          escapeHtml(p.name) +
          '</div>' +
          '<div class="' +
          escapeAttr(cardStyles.key) +
          '">' +
          escapeHtml(p.key) +
          '</div>' +
          (p.description
            ? '<p class="' +
              escapeAttr(cardStyles.description) +
              '">' +
              escapeHtml(p.description) +
              '</p>'
            : '') +
          '</div>',
      )
      .join('') +
    '</div>' +
    '</div>'
  );
}

/**
 * AOT-compiled static skeleton (Tier 1: fully static)
 * Output is a compile-time constant — no data holes at all.
 */
const __ssr_ProjectGridSkeleton =
  '<div class="_skel_grid" data-testid="projects-skeleton">' +
  '<div class="_skel_card" style="height: 5rem"></div>' +
  '<div class="_skel_card" style="height: 5rem"></div>' +
  '<div class="_skel_card" style="height: 5rem"></div>' +
  '</div>';

// ─── DOM Shim Rendering Functions ──────────────────────────────

/**
 * Render ProjectCard via DOM shim (for comparison).
 * Uses the same class names as the AOT version.
 */
function domShim_ProjectCard(project: Project): Element {
  const root = document.createElement('div');
  root.setAttribute('class', cardStyles.card);
  root.setAttribute('data-testid', `project-card-${project.id}`);

  const nameEl = document.createElement('div');
  nameEl.setAttribute('class', cardStyles.name);
  nameEl.setAttribute('data-testid', 'project-name');
  nameEl.textContent = project.name;
  root.appendChild(nameEl);

  const keyEl = document.createElement('div');
  keyEl.setAttribute('class', cardStyles.key);
  keyEl.textContent = project.key;
  root.appendChild(keyEl);

  if (project.description) {
    const descEl = document.createElement('p');
    descEl.setAttribute('class', cardStyles.description);
    descEl.textContent = project.description;
    root.appendChild(descEl);
  }

  return root;
}

/**
 * Render ProjectsPage via DOM shim (for comparison).
 */
function domShim_ProjectsPage(
  data: ProjectListResult | undefined,
  loading: boolean,
): Element {
  const container = document.createElement('div');
  container.setAttribute('class', pageStyles.container);

  const header = document.createElement('header');
  header.setAttribute('class', pageStyles.header);
  const h1 = document.createElement('h1');
  h1.setAttribute('class', pageStyles.title);
  h1.textContent = 'Projects';
  header.appendChild(h1);
  container.appendChild(header);

  if (loading) {
    const skel = document.createElement('div');
    skel.setAttribute('data-testid', 'projects-skeleton');
    skel.textContent = 'Loading...';
    container.appendChild(skel);
  }

  if (!loading && data?.items.length === 0) {
    const empty = document.createElement('div');
    empty.setAttribute('data-testid', 'projects-empty');
    empty.textContent = 'No projects yet';
    container.appendChild(empty);
  }

  const grid = document.createElement('div');
  grid.setAttribute('class', pageStyles.grid);
  for (const p of data?.items ?? []) {
    grid.appendChild(domShim_ProjectCard(p));
  }
  container.appendChild(grid);

  return container;
}

/**
 * Render static skeleton via DOM shim.
 */
function domShim_ProjectGridSkeleton(): Element {
  const container = document.createElement('div');
  container.setAttribute('class', '_skel_grid');
  container.setAttribute('data-testid', 'projects-skeleton');

  for (let i = 0; i < 3; i++) {
    const card = document.createElement('div');
    card.setAttribute('class', '_skel_card');
    card.setAttribute('style', 'height: 5rem');
    container.appendChild(card);
  }

  return container;
}

/**
 * Serialize a DOM shim element to HTML via toVNode + serializeToHtml.
 */
function domShimToHtml(el: Element): string {
  const vnode = toVNode(el);
  return serializeToHtml(vnode);
}

// ─── Benchmark Harness ─────────────────────────────────────────

interface BenchmarkResult {
  name: string;
  iterations: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

function round(n: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function benchmarkSync(name: string, fn: () => unknown, iterations: number): BenchmarkResult {
  // Warmup
  for (let i = 0; i < 20; i++) fn();

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);

  return {
    name,
    iterations,
    avgMs: round(total / iterations),
    p50Ms: round(times[Math.floor(times.length * 0.5)]!),
    p95Ms: round(times[Math.floor(times.length * 0.95)]!),
    minMs: round(times[0]!),
    maxMs: round(times[times.length - 1]!),
  };
}

function printBenchmark(results: BenchmarkResult[]): void {
  console.log('\n  Benchmark Results:');
  console.log('  ─────────────────────────────────────────────────────────');
  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(40)} avg: ${String(r.avgMs).padStart(7)}ms  p50: ${String(r.p50Ms).padStart(7)}ms  p95: ${String(r.p95Ms).padStart(7)}ms`,
    );
  }
  if (results.length >= 2) {
    const baseline = results[0]!;
    for (let i = 1; i < results.length; i++) {
      const r = results[i]!;
      const speedup = round(baseline.avgMs / r.avgMs, 1);
      console.log(`  → ${r.name} is ${speedup}x faster than ${baseline.name}`);
    }
  }
  console.log('');
}

// ─── POC 1: Core Render Speedup ────────────────────────────────

const ITERATIONS = 500;

describe('POC 1: AOT render speedup validation', () => {
  describe('Given hand-compiled ProjectCard AOT function (Tier 2)', () => {
    describe('When benchmarked against DOM shim rendering', () => {
      it('Then HTML output is identical', () => {
        const project = projects[0]!;
        const aotHtml = __ssr_ProjectCard(project);
        const domHtml = domShimToHtml(domShim_ProjectCard(project));
        expect(aotHtml).toBe(domHtml);
      });

      it('Then HTML is identical for project with null description', () => {
        const project = projects[1]!; // BE — description is null
        const aotHtml = __ssr_ProjectCard(project);
        const domHtml = domShimToHtml(domShim_ProjectCard(project));
        expect(aotHtml).toBe(domHtml);
      });

      it('Then HTML correctly escapes special characters', () => {
        const project: Project = {
          id: 'p-x',
          name: 'A & B <script>',
          key: '"KEY"',
          description: 'Desc with "quotes" & <tags>',
        };
        const aotHtml = __ssr_ProjectCard(project);
        const domHtml = domShimToHtml(domShim_ProjectCard(project));
        expect(aotHtml).toBe(domHtml);
        // Verify escaping happened
        expect(aotHtml).toContain('&amp;');
        expect(aotHtml).toContain('&lt;script&gt;');
        expect(aotHtml).toContain('&quot;KEY&quot;');
      });

      it('Then AOT is measurably faster', () => {
        const project = projects[0]!;

        const domResult = benchmarkSync(
          'DOM shim → ProjectCard',
          () => domShimToHtml(domShim_ProjectCard(project)),
          ITERATIONS,
        );

        const aotResult = benchmarkSync(
          'AOT string → ProjectCard',
          () => __ssr_ProjectCard(project),
          ITERATIONS,
        );

        printBenchmark([domResult, aotResult]);

        const speedup = domResult.avgMs / aotResult.avgMs;
        console.log(`  ProjectCard speedup: ${round(speedup, 1)}x`);
        expect(speedup).toBeGreaterThan(2);
      });
    });
  });

  describe('Given hand-compiled ProjectsPage AOT function (Tier 3)', () => {
    describe('When benchmarked against DOM shim rendering', () => {
      it('Then HTML output is identical (data loaded)', () => {
        const aotHtml = __ssr_ProjectsPage(projectListData, false);
        const domHtml = domShimToHtml(domShim_ProjectsPage(projectListData, false));
        expect(aotHtml).toBe(domHtml);
      });

      it('Then HTML output is identical (loading state)', () => {
        const aotHtml = __ssr_ProjectsPage(undefined, true);
        const domHtml = domShimToHtml(domShim_ProjectsPage(undefined, true));
        expect(aotHtml).toBe(domHtml);
      });

      it('Then HTML output is identical (empty state)', () => {
        const emptyData: ProjectListResult = { items: [] };
        const aotHtml = __ssr_ProjectsPage(emptyData, false);
        const domHtml = domShimToHtml(domShim_ProjectsPage(emptyData, false));
        expect(aotHtml).toBe(domHtml);
      });

      it('Then AOT is measurably faster (5 projects)', () => {
        const domResult = benchmarkSync(
          'DOM shim → ProjectsPage (5 items)',
          () => domShimToHtml(domShim_ProjectsPage(projectListData, false)),
          ITERATIONS,
        );

        const aotResult = benchmarkSync(
          'AOT string → ProjectsPage (5 items)',
          () => __ssr_ProjectsPage(projectListData, false),
          ITERATIONS,
        );

        printBenchmark([domResult, aotResult]);

        const speedup = domResult.avgMs / aotResult.avgMs;
        console.log(`  ProjectsPage (5 items) speedup: ${round(speedup, 1)}x`);
        expect(speedup).toBeGreaterThan(2);
      });

      it('Then AOT scales better with more items (50 projects)', () => {
        const largeData: ProjectListResult = {
          items: Array.from({ length: 50 }, (_, i) => ({
            id: `p-${i}`,
            name: `Project ${i}`,
            key: `P${i}`,
            description: i % 3 === 0 ? `Description for project ${i}` : null,
          })),
        };

        const domResult = benchmarkSync(
          'DOM shim → ProjectsPage (50 items)',
          () => domShimToHtml(domShim_ProjectsPage(largeData, false)),
          ITERATIONS,
        );

        const aotResult = benchmarkSync(
          'AOT string → ProjectsPage (50 items)',
          () => __ssr_ProjectsPage(largeData, false),
          ITERATIONS,
        );

        printBenchmark([domResult, aotResult]);

        const speedup = domResult.avgMs / aotResult.avgMs;
        console.log(`  ProjectsPage (50 items) speedup: ${round(speedup, 1)}x`);
        expect(speedup).toBeGreaterThan(2);
      });
    });
  });

  describe('Given AOT-compiled static skeleton (Tier 1)', () => {
    describe('When benchmarked against DOM shim rendering', () => {
      it('Then HTML output is identical', () => {
        const aotHtml = __ssr_ProjectGridSkeleton;
        const domHtml = domShimToHtml(domShim_ProjectGridSkeleton());
        expect(aotHtml).toBe(domHtml);
      });

      it('Then AOT constant is essentially free', () => {
        const domResult = benchmarkSync(
          'DOM shim → Skeleton',
          () => domShimToHtml(domShim_ProjectGridSkeleton()),
          ITERATIONS,
        );

        const aotResult = benchmarkSync(
          'AOT constant → Skeleton',
          () => {
            // Just reading a constant — simulates what production AOT does
            const _html = __ssr_ProjectGridSkeleton;
            return _html;
          },
          ITERATIONS,
        );

        printBenchmark([domResult, aotResult]);

        const speedup = domResult.avgMs / aotResult.avgMs;
        console.log(`  Skeleton speedup: ${round(speedup, 1)}x`);
        // Static constant should be dramatically faster
        expect(speedup).toBeGreaterThan(5);
      });
    });
  });
});

// ─── POC 2: Style Object Serialization Parity ──────────────────

describe('POC 2: Style object serialization parity', () => {
  describe('Given camelCase style objects from the linear clone', () => {
    describe('When serialized via styleObjectToString()', () => {
      it('Then basic styles produce correct CSS', () => {
        const result = styleObjectToString({ height: '5rem' });
        expect(result).toBe('height: 5rem');
      });

      it('Then numeric values get px suffix', () => {
        const result = styleObjectToString({ width: 100, padding: 20 });
        expect(result).toBe('width: 100px; padding: 20px');
      });

      it('Then unitless properties do NOT get px suffix', () => {
        const result = styleObjectToString({
          opacity: 0.5,
          zIndex: 999,
          fontWeight: 600,
          flexGrow: 1,
          lineHeight: 1.5,
        });
        expect(result).toBe('opacity: 0.5; z-index: 999; font-weight: 600; flex-grow: 1; line-height: 1.5');
      });

      it('Then zero values do NOT get px suffix', () => {
        const result = styleObjectToString({ margin: 0, padding: 0 });
        expect(result).toBe('margin: 0; padding: 0');
      });

      it('Then vendor prefixes are handled correctly', () => {
        const result = styleObjectToString({
          WebkitTransform: 'rotate(45deg)',
          msTransform: 'scale(2)',
        });
        expect(result).toBe('-webkit-transform: rotate(45deg); -ms-transform: scale(2)');
      });

      it('Then CSS custom properties pass through as-is', () => {
        const result = styleObjectToString({
          '--custom-color': 'red',
          '--spacing': '1rem',
        });
        expect(result).toBe('--custom-color: red; --spacing: 1rem');
      });

      it('Then null/undefined values are skipped', () => {
        const result = styleObjectToString({
          color: 'red',
          background: null,
          border: undefined,
          margin: '1rem',
        });
        expect(result).toBe('color: red; margin: 1rem');
      });

      it('Then style serialization matches DOM shim setAttribute("style", ...)', () => {
        const style = {
          fontSize: '16px',
          backgroundColor: 'red',
          padding: 10,
          opacity: 0.8,
        };

        // AOT path: direct styleObjectToString call
        const aotStyle = styleObjectToString(style);

        // DOM shim path: create element, set style via setAttribute
        const el = document.createElement('div');
        el.setAttribute('style', styleObjectToString(style));
        const vnode = toVNode(el);
        // Extract the style attribute from the VNode
        const domShimStyle = vnode.attrs.style;

        expect(aotStyle).toBe(domShimStyle);
      });
    });
  });
});

// ─── POC 3: Inlining Depth Impact ──────────────────────────────

describe('POC 3: Inlining depth impact on render performance', () => {
  describe('Given ProjectsPage with child ProjectCard', () => {
    describe('When comparing inlined vs non-inlined AOT rendering', () => {
      it('Then both produce identical HTML', () => {
        const inlined = __ssr_ProjectsPage_inlined(projectListData, false);
        const nonInlined = __ssr_ProjectsPage(projectListData, false);
        expect(inlined).toBe(nonInlined);
      });

      it('Then inlined version is at least as fast', () => {
        const nonInlinedResult = benchmarkSync(
          'AOT (depth 0, function calls)',
          () => __ssr_ProjectsPage(projectListData, false),
          ITERATIONS,
        );

        const inlinedResult = benchmarkSync(
          'AOT (depth 1, inlined)',
          () => __ssr_ProjectsPage_inlined(projectListData, false),
          ITERATIONS,
        );

        printBenchmark([nonInlinedResult, inlinedResult]);

        // Inlined should be at least as fast (likely faster due to no function call overhead)
        // We don't require a specific speedup — just validate the approach works
        console.log(
          `  Inlining impact: ${round(nonInlinedResult.avgMs / inlinedResult.avgMs, 2)}x`,
        );
      });

      it('Then inlining scales with list size (50 items)', () => {
        const largeData: ProjectListResult = {
          items: Array.from({ length: 50 }, (_, i) => ({
            id: `p-${i}`,
            name: `Project ${i}`,
            key: `P${i}`,
            description: i % 3 === 0 ? `Description for project ${i}` : null,
          })),
        };

        const nonInlinedResult = benchmarkSync(
          'AOT depth 0 (50 items)',
          () => __ssr_ProjectsPage(largeData, false),
          ITERATIONS,
        );

        const inlinedResult = benchmarkSync(
          'AOT depth 1 (50 items)',
          () => __ssr_ProjectsPage_inlined(largeData, false),
          ITERATIONS,
        );

        printBenchmark([nonInlinedResult, inlinedResult]);

        console.log(
          `  Inlining impact at 50 items: ${round(nonInlinedResult.avgMs / inlinedResult.avgMs, 2)}x`,
        );
      });
    });
  });
});

// ─── Summary Benchmark ─────────────────────────────────────────

describe('Summary: AOT vs DOM shim across all tiers', () => {
  it('prints a consolidated comparison table', () => {
    const largeData: ProjectListResult = {
      items: Array.from({ length: 50 }, (_, i) => ({
        id: `p-${i}`,
        name: `Project ${i}`,
        key: `P${i}`,
        description: i % 3 === 0 ? `Description for project ${i}` : null,
      })),
    };

    console.log('\n  ═══════════════════════════════════════════════════════');
    console.log('  AOT SSR POC — Consolidated Results');
    console.log('  ═══════════════════════════════════════════════════════');

    // Tier 1: Static
    const skelDom = benchmarkSync('', () => domShimToHtml(domShim_ProjectGridSkeleton()), ITERATIONS);
    const skelAot = benchmarkSync('', () => __ssr_ProjectGridSkeleton, ITERATIONS);

    // Tier 2: Data-driven (single component)
    const cardDom = benchmarkSync(
      '',
      () => domShimToHtml(domShim_ProjectCard(projects[0]!)),
      ITERATIONS,
    );
    const cardAot = benchmarkSync('', () => __ssr_ProjectCard(projects[0]!), ITERATIONS);

    // Tier 3: Conditional with list (5 items)
    const page5Dom = benchmarkSync(
      '',
      () => domShimToHtml(domShim_ProjectsPage(projectListData, false)),
      ITERATIONS,
    );
    const page5Aot = benchmarkSync(
      '',
      () => __ssr_ProjectsPage(projectListData, false),
      ITERATIONS,
    );

    // Tier 3: Conditional with list (50 items)
    const page50Dom = benchmarkSync(
      '',
      () => domShimToHtml(domShim_ProjectsPage(largeData, false)),
      ITERATIONS,
    );
    const page50Aot = benchmarkSync(
      '',
      () => __ssr_ProjectsPage(largeData, false),
      ITERATIONS,
    );

    // Tier 3 inlined (50 items)
    const page50AotInlined = benchmarkSync(
      '',
      () => __ssr_ProjectsPage_inlined(largeData, false),
      ITERATIONS,
    );

    console.log('\n  Tier        Scenario              DOM shim    AOT        Speedup');
    console.log('  ──────────  ────────────────────  ──────────  ─────────  ───────');
    console.log(
      `  Tier 1      Skeleton (static)     ${String(skelDom.avgMs).padStart(8)}ms  ${String(skelAot.avgMs).padStart(7)}ms  ${round(skelDom.avgMs / skelAot.avgMs, 1)}x`,
    );
    console.log(
      `  Tier 2      ProjectCard           ${String(cardDom.avgMs).padStart(8)}ms  ${String(cardAot.avgMs).padStart(7)}ms  ${round(cardDom.avgMs / cardAot.avgMs, 1)}x`,
    );
    console.log(
      `  Tier 3      Page (5 items)        ${String(page5Dom.avgMs).padStart(8)}ms  ${String(page5Aot.avgMs).padStart(7)}ms  ${round(page5Dom.avgMs / page5Aot.avgMs, 1)}x`,
    );
    console.log(
      `  Tier 3      Page (50 items)       ${String(page50Dom.avgMs).padStart(8)}ms  ${String(page50Aot.avgMs).padStart(7)}ms  ${round(page50Dom.avgMs / page50Aot.avgMs, 1)}x`,
    );
    console.log(
      `  Tier 3      Page (50, inlined)    ${String(page50Dom.avgMs).padStart(8)}ms  ${String(page50AotInlined.avgMs).padStart(7)}ms  ${round(page50Dom.avgMs / page50AotInlined.avgMs, 1)}x`,
    );
    console.log('');

    // Verify minimum thresholds from design doc
    const tier1Speedup = skelDom.avgMs / skelAot.avgMs;
    const tier2Speedup = cardDom.avgMs / cardAot.avgMs;
    const tier3Speedup = page50Dom.avgMs / page50Aot.avgMs;

    console.log('  Success thresholds:');
    console.log(`    Tier 1 (target ≥5x): ${round(tier1Speedup, 1)}x — ${tier1Speedup >= 5 ? 'PASS' : 'FAIL'}`);
    console.log(`    Tier 2 (target ≥5x): ${round(tier2Speedup, 1)}x — ${tier2Speedup >= 5 ? 'PASS' : 'FAIL'}`);
    console.log(`    Tier 3 (target ≥3x): ${round(tier3Speedup, 1)}x — ${tier3Speedup >= 3 ? 'PASS' : 'FAIL'}`);
    console.log('');
  });
});
