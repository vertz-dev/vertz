# AOT-Compiled SSR: Pre-compiled Component Templates

> Eliminate the last DOM traversal by pre-compiling components into string-concatenation functions at build time. Data from the manifest-driven prefetch is injected as function arguments — no DOM shim, no virtual DOM, no context stack overhead.

## Status

**Draft — Rev 3** — POC results added. All three POCs validated. Inlining dropped based on POC 3 findings.

**Depends on:** SSR single-pass with zero-discovery prefetch (#1741, merged).

**Issue:** #1745

## Why Now

This design is motivated by three converging factors:

1. **Vertz Cloud edge rendering** — On the cloud platform, SSR runs at the edge (Cloudflare Workers). CPU time is metered and limited. Every millisecond of render time costs money and eats into the 10ms CPU budget. AOT reduces CPU usage per request by eliminating virtual DOM overhead.

2. **Build-in-public differentiation** — Vertz positions itself as performance-first. Competing with Marko, Svelte, and SolidStart on SSR benchmarks requires compiled string output, not interpreted virtual DOM. This is a credible claim only with real numbers.

3. **Foundation is ready** — Zero-discovery (#1741) proved that data prefetch and render are cleanly separable. The prefetch manifest already maps routes to components and queries. The compiler already classifies variables as static vs reactive. The architectural preconditions are met.

**This is a research design doc.** Phase 0 (POC) must validate the core performance claim before implementation phases begin. If the POC shows less than 3x render speedup, we reconsider the approach.

## POC Results

Three POCs conducted. All passed. Test file: `packages/ui-server/src/__tests__/ssr-aot-poc.test.ts` (23 tests).

### POC 1: Core Render Speedup

**Question:** What is the actual render speedup when replacing DOM shim serialization with string concatenation for Vertz components?

**Result: VALIDATED — 4-8x speedup on data-driven components, ∞ on static.**

Hand-compiled `ProjectCard` (tier 2) and `ProjectsPage` (tier 3) to string concatenation. Benchmarked 500 iterations against DOM shim rendering with identical data.

| Tier | Scenario | DOM shim | AOT | Speedup |
|---|---|---|---|---|
| Tier 1 | Static skeleton | 0.004ms | ~0ms | **∞** (constant) |
| Tier 2 | ProjectCard (single) | 0.003–0.008ms | 0.001ms | **3–8x** |
| Tier 3 | Page (5 items) | 0.018–0.026ms | 0.003–0.005ms | **5–6x** |
| Tier 3 | Page (50 items) | 0.136–0.145ms | 0.025–0.035ms | **4–5.5x** |

**Key findings:**
- Tier 1 (static): Essentially free — compile-time constant string, no function call
- Tier 2 (single component): 3-8x — small absolute times cause variance, but consistently faster
- Tier 3 (composite page with list): **Consistently 4-6x faster** — this is the primary use case
- HTML output is **byte-identical** between AOT and DOM shim for all tested cases including special character escaping
- The speedup is pure CPU savings — no I/O involved in the measurement

**Revised estimate:** 4-6x for typical pages (was "5-20x"). The upper bound of 20x was optimistic — realistic pages with conditionals and lists land at 4-6x. Static constants are ∞ but a small fraction of total render time.

### POC 2: Style Object Serialization

**Question:** Can `styleObjectToString()` be reused for AOT, and does the output match DOM shim's style serialization?

**Result: VALIDATED — exact parity, no issues.**

Tested: basic CSS properties, numeric values with auto-`px`, unitless properties (opacity, zIndex, fontWeight), zero values, vendor prefixes (Webkit, ms), CSS custom properties (--vars), null/undefined skipping.

All 7 tests pass. `styleObjectToString()` output matches DOM shim's `setAttribute('style', ...)` exactly. The AOT transformer can call `styleObjectToString()` directly — no new implementation needed.

### POC 3: Inlining Depth

**Question:** What's the optimal cross-component inlining depth for AOT functions?

**Result: INLINING PROVIDES NO BENEFIT — drop it from the design.**

| Approach | 5 items | 50 items |
|---|---|---|
| Depth 0 (function calls) | 0.003ms | 0.027ms |
| Depth 1 (inlined) | 0.004ms | 0.030ms |
| Ratio | **0.75-1.0x** | **0.9x** |

Inlined code is **slightly slower** (0.9x at 50 items). V8/JSC optimize small function calls extremely well — the call overhead is negligible. Inlining produces larger generated code, which can hurt instruction cache locality.

**Design change:** Cross-component inlining is **removed** from the design. AOT functions remain separate callable units. This eliminates:
- The `linkAotFunctions()` post-compilation step
- Build ordering dependencies
- Circular dependency handling
- Increased manifest size from storing function bodies
- Source map complexity from cross-file inlining

The compiler becomes simpler: per-file, single-pass, no linking step.

## Context: SSR Performance Spectrum

The SSR pipeline has evolved through three tiers, each removing a DOM traversal:

| Approach | DOM traversals | Measured speed | Status |
|---|---|---|---|
| Two-pass (baseline) | 3 (discover + render + render) | 1x | Shipped |
| Discovery single-pass | 2 (discover + render) | ~1.4x faster | Shipped (#1741) |
| Zero-discovery | 1 (render only) | ~1.8x faster | Shipped (#1741) |
| **AOT compiled** | **0** (string concat) | **target: 3-20x** | This design |

Zero-discovery removed the discovery DOM traversal. **The remaining bottleneck is the render traversal itself** — the DOM shim creates virtual nodes, sets attributes, builds a tree, then serializes it to HTML. AOT compilation eliminates this entire layer by generating functions that produce HTML strings directly.

## Problem

Even with zero-discovery, every SSR request still:

1. **Allocates DOM shim nodes** — `SSRElement`, `SSRTextNode`, `SSRComment` objects for every HTML element in the component tree
2. **Builds a virtual DOM tree** — sets attributes via dictionaries, appends children via arrays, manages parent/child relationships
3. **Manages the context stack** — `ContextScope` Map lookups for every `useContext()` call
4. **Evaluates signal wrappers** — getter-based reactivity wrapping that's unnecessary in SSR (values are static on the server)
5. **Serializes to HTML** — walks the virtual tree calling `__serialize()` on every node

DOM rendering is **87.5% of single-pass cost** (POC measurements from #1741). The data is already available from prefetch — we're spending 87.5% of our time on the *serialization format*, not on the *computation*.

**The insight:** Components are pure functions of their props and query data. The compiler knows the JSX structure at build time. Instead of interpreting JSX through the DOM shim at runtime, we can compile it to string concatenation at build time.

### Developer impact

The render speedup matters most in these scenarios:

1. **High-throughput servers** — Reduced CPU per request means higher requests/second under load. A 5x render speedup means 5x fewer CPU cycles spent on HTML generation.
2. **Edge/serverless deployments** — Metered CPU environments (Cloudflare Workers, AWS Lambda) where every millisecond costs money. AOT reduces per-request cost.
3. **Render-heavy pages** — Complex UIs with many components (dashboards, data tables, nested layouts) where DOM shim overhead is the bottleneck.
4. **Cold starts** — Less code to execute at startup when AOT functions are pre-compiled constants.

For **I/O-bound pages** (50ms+ query latency), the end-user-visible improvement is small because data fetch dominates. But CPU savings still apply — the server does less work per request, freeing resources for concurrent requests.

## Solution

A new compiler entry point (`compileForSSRAot()`) that transforms component JSX into optimized string-builder functions. These functions take resolved data as arguments and return HTML strings directly — no DOM shim, no virtual DOM, no runtime JSX evaluation.

### Current SSR flow (zero-discovery)
```
URL → manifest lookup → parallel fetch → DOM shim render → serialize → HTML string
```

### Proposed AOT SSR flow
```
URL → manifest lookup → parallel fetch → call compiled function(data, ctx) → HTML string
```

### What the compiler generates

For a component like:

```tsx
function ProjectCard({ project }: { project: Project }) {
  return (
    <div class="card">
      <h2>{project.name}</h2>
      <p>{project.description}</p>
      <span class="badge">{project.issueCount} issues</span>
    </div>
  );
}
```

The `ssr-aot` compiler produces:

```ts
function __ssr_ProjectCard(props: { project: Project }): string {
  const { project } = props;
  return '<div class="card"><h2>'
    + __esc(project.name)
    + '</h2><p>'
    + __esc(project.description)
    + '</p><span class="badge">'
    + __esc(project.issueCount)
    + ' issues</span></div>';
}
```

No DOM shim. No virtual DOM. No signal wrappers. Just string concatenation with HTML escaping.

### Three tiers of AOT compilation

Not every JSX expression compiles to a static string template. The compiler classifies each subtree:

#### Tier 1: Fully static (pure string concatenation)

HTML elements with literal attributes and text. No runtime data at all.

```tsx
// Input
<footer class="app-footer">
  <p>Built with Vertz</p>
</footer>

// Output — compile-time constant
const __static_footer = '<footer class="app-footer"><p>Built with Vertz</p></footer>';
```

#### Tier 2: Data-driven (string concatenation with holes)

HTML elements with dynamic data from props or query results. Structure is static, only data varies.

```tsx
// Input
<li data-id={issue.id} class="issue-row">
  <span class="title">{issue.title}</span>
  <span class="status">{issue.status}</span>
</li>

// Output
'<li data-id="' + __esc_attr(issue.id) + '" class="issue-row">'
  + '<span class="title">' + __esc(issue.title) + '</span>'
  + '<span class="status">' + __esc(issue.status) + '</span>'
+ '</li>'
```

#### Tier 3: Conditional/dynamic (generated function with branching)

Expressions that require runtime decisions — conditionals, ternaries, loops.

```tsx
// Input
{issue.labels.length > 0 && (
  <div class="labels">
    {issue.labels.map(l => <LabelBadge label={l} />)}
  </div>
)}

// Output
+ (issue.labels.length > 0
  ? '<div class="labels">'
    + issue.labels.map(l => __ssr_LabelBadge({ label: l })).join('')
    + '</div>'
  : '<!--conditional-->')
```

#### Runtime fallback

Components that cannot be AOT-compiled at all. Rendered via DOM shim at request time.

### HTML element handling

#### Void elements

The AOT transformer uses the same `VOID_ELEMENTS` set as the HTML serializer (`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`). Void elements produce no closing tag:

```tsx
// Input
<input type="text" name="title" disabled />

// Output
'<input type="text" name="title" disabled>'
// NOT: '<input type="text" name="title" disabled></input>'
```

#### Fragments

JSX fragments (`<>...</>`) produce concatenated child strings with no wrapper element:

```tsx
// Input
function StatusBadges({ statuses }: Props) {
  return (
    <>
      <span class="open">{statuses.open}</span>
      <span class="closed">{statuses.closed}</span>
    </>
  );
}

// Output
function __ssr_StatusBadges(props: { statuses: Statuses }): string {
  const { statuses } = props;
  return '<span class="open">' + __esc(statuses.open) + '</span>'
    + '<span class="closed">' + __esc(statuses.closed) + '</span>';
}
```

When inlined into a parent, fragment children are concatenated directly — no wrapper needed.

#### Prop aliasing

The AOT transformer maps JSX prop names to HTML attribute names, matching the DOM shim's behavior:

- `className` → `class`
- `htmlFor` → `for`

```tsx
// Input
<div className={styles.card}>
  <label htmlFor="name">Name</label>
</div>

// Output
'<div class="' + __esc_attr(styles.card) + '">'
  + '<label for="name">Name</label>'
+ '</div>'
```

#### Raw text elements

`<script>` and `<style>` elements have raw text content that must NOT be HTML-escaped (matching the HTML serializer's `RAW_TEXT_ELEMENTS` set):

```tsx
// Input
<script type="application/json">{jsonData}</script>

// Output — no __esc() for script content
'<script type="application/json">' + String(jsonData) + '</script>'
```

#### Spread attributes

Components with JSX spread attributes (`<div {...rest} />`) are classified as **tier 3 minimum** because the attribute set is unknown at compile time. The AOT transformer generates a call to `__ssr_spread()`:

```tsx
// Input
<div class="base" {...extraProps}>content</div>

// Output
'<div class="base"' + __ssr_spread(extraProps) + '>content</div>'
```

The `__ssr_spread()` helper iterates keys at runtime, applying prop aliasing and escaping:

```ts
function __ssr_spread(props: Record<string, unknown>): string {
  let result = '';
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) continue; // skip event handlers
    const attrName = key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key;
    if (key === 'style' && typeof value === 'object') {
      result += ' style="' + __esc_attr(styleObjectToString(value)) + '"';
    } else if (value === true) {
      result += ' ' + attrName;
    } else {
      result += ' ' + attrName + '="' + __esc_attr(value) + '"';
    }
  }
  return result;
}
```

#### Style objects

Inline `style` props using camelCase objects are serialized via the existing `styleObjectToString()` from `@vertz/ui`:

```tsx
// Input
<div style={{ fontSize: '16px', backgroundColor: 'red' }}>content</div>

// Output
'<div style="font-size: 16px; background-color: red">content</div>'
```

The AOT transformer emits `styleObjectToString()` calls for non-literal style values.

### Hydration markers in AOT output

AOT output must include **all four** hydration marker types that the runtime renderer produces, so client-side hydration works identically.

#### 1. Interactive component markers (`data-v-id`)

Components with `let` declarations (reactive state) get a `data-v-id` attribute on their root element:

```tsx
// Component with reactive state
function Counter({ initial }: { initial: number }) {
  let count = initial;
  return <button onClick={() => count++}>{count}</button>;
}

// AOT output
function __ssr_Counter(props: { initial: number }): string {
  return '<button data-v-id="Counter">'
    + __esc(props.initial)
    + '</button>';
}
```

Static components (no `let` declarations) produce no `data-v-id` — same as the runtime renderer.

#### 2. Conditional markers (`<!--conditional-->` / `<!--/conditional-->`)

Conditional expressions emit **paired** start and end markers:

```tsx
// Input
{isLoading && <Spinner />}

// AOT output — paired markers
+ '<!--conditional-->'
+ (isLoading
  ? __ssr_Spinner({})
  : '')
+ '<!--/conditional-->'
```

The `hydrateConditional()` function claims both the start anchor and end marker. Omitting the end marker would corrupt the hydration cursor.

#### 3. Reactive child markers (`<!--child-->`)

Reactive text expressions (those that can change on the client) emit `<!--child-->` markers:

```tsx
// Input — reactive text expression
<span>{count}</span>

// AOT output for interactive component (count is a signal on client)
'<span><!--child-->' + __esc(count) + '<!--/child--></span>'
```

The hydration system uses the pause/resume pattern: SSR content between `<!--child-->` markers is cleared and re-rendered via CSR during hydration. Static text (literal strings, no reactive source) does NOT get child markers.

#### 4. List markers

List rendering (`.map()` with keys) emits markers for the hydration cursor to identify list boundaries:

```tsx
// Input
{items.map(item => <Item key={item.id} item={item} />)}

// AOT output
+ '<!--list-->'
+ items.map(item => __ssr_Item({ item })).join('')
+ '<!--/list-->'
```

#### Marker parity guarantee

The AOT transformer determines which markers to emit by consulting the same classification the `HydrationTransformer` uses:
- Component has `let` declarations → `data-v-id`
- Expression depends on signal/reactive source → `<!--child-->` markers
- JSX uses ternary/`&&` → `<!--conditional-->` paired markers
- JSX uses `.map()` → `<!--list-->` paired markers

Static expressions (literal text, const-only components) emit no markers — matching the runtime renderer.

### Cross-component references

Child components referenced in JSX are called as separate AOT functions. POC 3 validated that function call overhead is negligible — V8/JSC optimize small function calls extremely well.

```tsx
// Parent: ProjectsPage uses ProjectCard
function ProjectsPage() {
  const projects = query(api.projects.list());
  return (
    <div class="projects-grid">
      {projects.data?.items.map(p => <ProjectCard project={p} />)}
    </div>
  );
}

// AOT output — ProjectCard called as function (NOT inlined)
function __ssr_ProjectsPage(data: { projects: ProjectListResult }): string {
  return '<div class="projects-grid">'
    + '<!--list-->'
    + (data.projects?.items ?? []).map(p =>
        __ssr_ProjectCard({ project: p })
      ).join('')
    + '<!--/list-->'
    + '</div>';
}
```

Each component is compiled independently per-file (same single-pass architecture as the `dom` target). No linking step, no build ordering dependencies, no circular dependency handling needed.

### Runtime holes

Some components **cannot** be AOT-compiled. The AOT function calls a closure-based fallback that renders via the DOM shim:

```ts
// AOT function with a runtime hole for <Outlet />
function __ssr_ProjectLayout(
  data: { project: Project },
  ctx: SSRAotContext,
): string {
  return '<div class="layout"><header>'
    + '<h1>' + __esc(data.project.name) + '</h1>'
    + '</header><main>'
    + ctx.holes.Outlet()  // ← closure captures component + context
    + '</main></div>';
}
```

**When a component falls back to runtime rendering:**

1. **Dynamic imports / lazy routes** — `<Outlet />` renders different components based on URL. The AOT function can't know which child at compile time.
2. **Dialog content** — Opened imperatively via `useDialogStack()`. Not part of the static component tree.
3. **Components that read reactive context** — `useAuth()` result determines which JSX branch renders. Detected via `ReactivityAnalyzer`'s reactive source tracking.
4. **Third-party components** — Components from external packages without AOT manifests.
5. **Components with spread attributes on the root element** — When the root element itself uses `{...props}`, the tag structure isn't fully static (though this is rare).

#### Runtime hole execution context

The `renderHole()` closures capture the full DOM shim execution environment:

```ts
// Generated by the AOT pipeline — NOT by the developer
function createHoles(
  module: SSRModule,
  ssrCtx: SSRRenderContext,
  queryCache: Map<string, unknown>,
): SSRAotHoles {
  return {
    Outlet: () => {
      // Run inside ssrStorage context (AsyncLocalStorage)
      return ssrStorage.run(ssrCtx, () => {
        // ContextScope is pre-populated from parent's context setup
        const app = module.resolveComponent('Outlet', ssrCtx);
        const vnode = toVNode(app);
        return serializeToString(vnode);
      });
    },
  };
}
```

Key design decisions:
- **Closures, not strings** — Each hole is a closure that captures the component factory and SSR context. No string-based component lookup (avoids name collisions and the registry problem).
- **ssrStorage scope** — The closure runs inside `ssrStorage.run()`, providing the `SSRRenderContext` that `useContext()`, `query()`, and other SSR primitives need.
- **ContextScope inheritance** — The parent AOT function sets up contexts (router, auth) before invoking the hole. The hole's DOM shim render inherits this context state.
- **Query data sharing** — The `ssrCtx.queryCache` is pre-populated from the prefetch step. Both AOT (via `ctx.getData()`) and DOM shim (via `query()` cache hits) read from the same cache.

### SSRAotContext

```ts
interface SSRAotContext {
  /** Pre-generated closures for runtime-rendered components */
  holes: Record<string, () => string>;

  /** Access query data by cache key */
  getData(key: string): unknown;

  /** Read auth session for conditional rendering */
  session: PrefetchSession;

  /** Route params for the current request */
  params: Record<string, string>;
}
```

### CSS handling

AOT functions collect CSS the same way the runtime renderer does — via `collectCSS()`. The CSS extraction pipeline (`css()` and `variants()` calls) runs at build time and produces sidecar CSS files. AOT functions reference the same CSS class names. No change to the CSS pipeline.

### Escape hatch

A `// @vertz-no-aot` file-level pragma forces all components in a file to use runtime rendering:

```tsx
// @vertz-no-aot — forces runtime rendering for all components in this file
function ComplexWidget({ data }: Props) {
  // ... component that AOT misclassifies
}
```

This is intentionally rare — the compiler is conservative (any uncertain component falls back to runtime automatically). The pragma exists for edge cases where the compiler classifies a component as AOT-able but the output is incorrect.

## API Surface

### No change to developer-facing APIs

Developers write the same components. The AOT target is a compiler optimization, not a new API.

```tsx
// Developer code — unchanged
function IssueListPage() {
  const { projectId } = useParams<'/projects/:projectId'>();
  const issues = query(api.issues.list({ where: { projectId } }));
  const project = query(api.projects.get(projectId));

  return (
    <div class="page">
      <h1>{project.data?.name} — Issues</h1>
      {issues.loading && <IssueListSkeleton />}
      {issues.data?.items.map(issue => (
        <IssueRow issue={issue} projectKey={project.data?.key ?? ''} />
      ))}
    </div>
  );
}
```

The compiler decides at build time whether to AOT-compile this component or fall back to the DOM shim. The developer doesn't opt in or opt out.

### Build configuration

```ts
// vertz.config.ts — opt-in at the project level
export default defineConfig({
  ssr: {
    aot: true, // Enable AOT-compiled SSR (default: false initially)
  },
});
```

Once stable, AOT becomes the default. The flag exists for the transition period.

### Diagnostic endpoint

```
GET /__vertz_ssr_aot → JSON (dev mode only, gated behind NODE_ENV !== 'production')
{
  "components": {
    "ProjectCard": { "tier": "data-driven", "inlinedInto": ["ProjectsPage"] },
    "IssueRow": { "tier": "data-driven", "inlinedInto": ["IssueListPage"] },
    "IssueListPage": { "tier": "conditional", "holes": ["dialogTrigger"] },
    "WorkspaceShell": { "tier": "runtime-fallback", "reason": "reads useAuth()" }
  },
  "coverage": {
    "total": 23,
    "aot": 18,
    "runtime": 5,
    "percentage": 78
  }
}
```

### Dev-mode divergence detection

In development, when `VERTZ_DEBUG=aot` is set, the SSR pipeline renders each AOT route **twice**: once via AOT and once via DOM shim. If the outputs differ, a warning is emitted via the WebSocket error channel (`ssr` category) with the component name and a unified diff of the divergent sections. This only runs in dev — production uses AOT exclusively.

### Build-time classification logging

During `vertz build` (or via `VERTZ_DEBUG=aot`):

```
[aot] ProjectCard: tier 2 (data-driven)
[aot] IssueRow: tier 2 (data-driven), inlined into IssueListPage
[aot] IssueListPage: tier 3 (conditional), 1 hole (dialogTrigger)
[aot] WorkspaceShell: runtime-fallback (reads useAuth())
[aot] Coverage: 18/23 components (78%), ~90% HTML coverage
```

## Feasibility Analysis: Linear Clone

Analyzed all 23 components in `examples/linear/`:

### Tier 1 — Fully static (5 components)

- `BoardSkeleton`, `IssueListSkeleton`, `ProjectGridSkeleton`, `IssueDetailSkeleton`, `AuthLoadingSkeleton`
- Pure CSS structure, no data dependencies

### Tier 2 — Data-driven (7 components)

- `LabelBadge`, `IssueRow`, `IssueCard`, `ProjectCard`, `CommentItem`, `ViewToggle`, `StatusColumn`
- Accept props, render predictable HTML. Structure doesn't change based on data — only content fills in.

### Tier 3 — Conditional (6 components)

- `LabelFilter`, `StatusFilter`, `StatusSelect`, `PrioritySelect`, `ProjectLayout`, `ProjectsPage`
- Have conditionals or loops, but structure is still statically analyzable. The compiler generates branching string builders.

### Partial AOT with runtime holes (3 components)

- `IssueListPage` — page structure AOT-compiled, `useDialogStack()` trigger is a runtime hole
- `ProjectBoardPage` — page structure AOT-compiled, `useDialogStack()` trigger is a runtime hole
- `IssueDetailPage` — page structure AOT-compiled, `useDialogStack()` + conditional sidebar are runtime holes

These pages have large AOT-able subtrees. The entire list rendering, filtering UI, and layout is deterministic from query data — only the dialog trigger button's event handler and imperative dialog opening are runtime holes.

### Full runtime fallback (2 components)

- `LoginPage` — reads `useAuth()` context
- `WorkspaceShell` — reads `useAuth()` + renders dynamic nav based on projects query

### Projected coverage

| Metric | Value |
|---|---|
| Total components | 23 |
| Fully AOT-compiled (tier 1-3) | 18 (78%) |
| Partial AOT (with runtime holes) | 3 (13%) |
| Full runtime fallback | 2 (9%) |
| **Effective HTML coverage** | **~90%** of page HTML is AOT-generated |

## Performance Model

### Current best (zero-discovery single-pass)
```
Total = manifest_lookup + parallel_fetch + DOM_shim_render
      ≈ ~0ms + max(query_times) + render_time
```

### Proposed (AOT)
```
Total = manifest_lookup + parallel_fetch + AOT_string_concat + hole_render
      ≈ ~0ms + max(query_times) + (render_time × 0.05–0.20) + hole_overhead
```

### Why 4-6x render speedup is confirmed (POC-validated)

String concatenation vs DOM shim eliminates:

| Overhead | DOM shim cost | AOT cost |
|---|---|---|
| Object allocation per node | `new SSRElement()` per HTML tag | None (no objects created) |
| Attribute dictionaries | `attrs: Record<string, string>` per element | Literal string concatenation |
| Child array management | `childNodes.push()`, parent/child linking | None (output order = code order) |
| Context stack lookups | `ContextScope` Map.get per `useContext()` | Resolved at compile time (inlined) |
| Signal/getter evaluation | `() => value` thunks unwrapped at render | Direct variable reference |
| Serialization pass | Walk tree, call `__serialize()` per node | Already a string (no serialization) |

**Reference points from other frameworks:**

- **Marko** (eBay): SSR via compiled string concatenation — consistently fastest in JS Framework Benchmark SSR
- **Svelte**: SSR mode compiles to string builders, no virtual DOM — 3-10x faster than VDOM-based frameworks
- **SolidStart**: JSX → string concatenation for SSR — similar architecture to what we're proposing

### Measured savings by page complexity (POC 1)

| Page type | DOM shim | AOT (measured) | Speedup |
|---|---|---|---|
| Static skeleton (tier 1) | 0.004ms | ~0ms (constant) | **∞** |
| Single component (tier 2) | 0.003–0.008ms | 0.001ms | **3–8x** |
| Page with 5 items (tier 3) | 0.018–0.026ms | 0.003–0.005ms | **5–6x** |
| Page with 50 items (tier 3) | 0.136–0.145ms | 0.025–0.035ms | **4–5.5x** |

**Important caveats:**
- These are **render-only** measurements (excluding I/O). For I/O-bound pages (50ms+ query latency), the absolute user-visible savings are small because data fetch dominates. The CPU savings still apply.
- Pages with runtime holes will have lower speedups due to `renderHole()` context switching overhead (~0.005ms per hole). Estimate: 3-4x for pages with 2-3 holes.
- Speedup converges to **~4-5x** as page complexity increases (50-item list). The constant factor overhead of string concatenation setup becomes proportionally smaller.

## Success Criteria

The feature is considered successful when:

1. **Render speedup:** Minimum 3x for pages with runtime holes, minimum 4x for fully AOT pages (POC validated 4-6x for tier 3, 3-8x for tier 2)
2. **HTML parity:** Byte-identical output between AOT and DOM shim rendering for all AOT-compiled components (POC validated for ProjectCard, ProjectsPage, skeleton — CI gate for all components)
3. **Hydration parity:** Client hydration attaches correctly to AOT-rendered HTML with zero mismatch warnings (verified by Playwright E2E tests)
4. **Build time:** AOT compilation adds no more than 15% to total build time (measured on the linear clone)
5. **Coverage:** At least 75% of components in the linear clone are AOT-compiled (current estimate: 78%)

## Compiler Pipeline Design

### New entry point: `compileForSSRAot()`

Rather than adding conditional branches throughout the existing `compile()` function, AOT uses a **separate entry point** that shares analyzers but uses different transformers:

```ts
// packages/ui-compiler/src/compiler.ts

export function compileForSSRAot(
  source: string,
  options?: CompileOptions,
): AotCompileOutput {
  const sourceFile = parseSource(source, options);

  // Step 1-2: Same analyzers as compile()
  const components = ComponentAnalyzer.analyze(sourceFile);
  const propsTransformer = new PropsDestructuringTransformer(sourceFile);
  propsTransformer.transform(components);

  // Step 3: ReactivityAnalyzer for CLASSIFICATION ONLY
  // (determines which vars are reactive, which are static)
  const reactivity = ReactivityAnalyzer.analyze(sourceFile, components);

  // Step 4: JsxAnalyzer to classify expressions
  const jsxAnalysis = JsxAnalyzer.analyze(sourceFile, reactivity);

  // Step 5: HydrationTransformer to identify interactive components
  const hydration = HydrationTransformer.classify(components);

  // Step 6: AOT-SPECIFIC — string builder generation
  // SKIPS: SignalTransformer, ComputedTransformer, MountFrameTransformer
  const aotTransformer = new AotStringTransformer(
    sourceFile, components, reactivity, jsxAnalysis, hydration
  );
  const aotOutput = aotTransformer.transform();

  return {
    code: aotOutput.code,
    map: aotOutput.sourceMap,
    tier: aotOutput.tier,        // 'static' | 'data-driven' | 'conditional' | 'runtime-fallback'
    holes: aotOutput.holes,      // component names that need runtime rendering
    inlineable: aotOutput.inlineable,
    diagnostics: aotOutput.diagnostics,
  };
}
```

### What's shared vs different

| Step | `compile()` (dom) | `compileForSSRAot()` |
|---|---|---|
| Parse source | Shared | Shared |
| ComponentAnalyzer | Shared | Shared |
| Props destructuring | Shared | Shared |
| ReactivityAnalyzer | Full (signals, computeds) | **Classification only** (same analysis, but results used differently) |
| SignalTransformer | `let` → `signal()` | **Skipped** (keep as `const` with initial value) |
| ComputedTransformer | `const` → `computed()` | **Skipped** (evaluate inline) |
| JsxAnalyzer | Classify expressions | Shared (same classification) |
| JSX transform | `__element()`, `__attr()`, `__child()` | **AotStringTransformer** (string concatenation) |
| HydrationTransformer | Marks interactive components | **Classification only** (determines `data-v-id`, marker placement) |
| MountFrameTransformer | `__pushMountFrame()` | **Skipped** (no mount lifecycle in SSR) |
| Import generation | `@vertz/ui/internals` | **AOT helpers import** (`__esc`, `styleObjectToString`, etc.) |

### AotStringTransformer

The new transformer walks JSX nodes and produces string concatenation code:

- HTML elements → literal string parts with attribute holes
- Text content → `__esc(value)` calls
- Attribute values → `__esc_attr(value)` calls
- Conditionals → inline ternaries with comment markers
- Lists → `.map().join('')` with list markers
- Component references → inline AOT body (if available in manifest) or hole reference
- Fragments → concatenated children with no wrapper
- Void elements → no closing tag
- Raw text elements (`<script>`, `<style>`) → no escaping on children
- Style objects → `styleObjectToString()` calls
- Spread attributes → `__ssr_spread()` calls
- `className` → `class`, `htmlFor` → `for`

### String builder helpers

```ts
// packages/ui-server/src/ssr-aot/helpers.ts

/** Escape HTML content — matches existing escapeHtml() from html-serializer.ts */
function __esc(value: unknown): string {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map(v => __esc(v)).join('');
  const s = String(value);
  return s.replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[c]!);
}

/** Escape HTML attribute value — same charset as __esc for parity */
const __esc_attr = __esc;

/** Render boolean attribute (present or absent) */
function __bool_attr(name: string, value: unknown): string {
  return value ? ' ' + name : '';
}
```

Note: `__esc()` escapes `&`, `<`, `>`, `"` — matching the existing `escapeHtml()` in `html-serializer.ts`. Single quotes are NOT escaped (matching existing behavior). `__esc_attr` is an alias for `__esc` — a single escaping function prevents subtle divergence.

### Integration with SSR pipeline

```ts
// packages/ui-server/src/ssr-render.ts — new function

export async function ssrRenderAot(
  module: SSRModule,
  url: string,
  options: SSRRenderOptions & {
    manifest: PrefetchManifest;
    aotManifest: AotManifest;
    session: SSRAuth;
  },
): Promise<SSRRenderResult> {
  const { manifest, aotManifest, session } = options;

  // 1. Match URL to route
  const matched = matchRoute(manifest.routes, url);
  if (!matched) {
    return ssrRenderSinglePass(module, url, options);
  }

  // 2. Check for AOT entry
  const aotRoute = aotManifest.routes[matched.pattern];
  if (!aotRoute) {
    return ssrRenderSinglePass(module, url, options);
  }

  // 3. Prefetch data (same as zero-discovery)
  const queryCache = await prefetchFromManifest(matched, manifest, session);

  // 4. Set up SSR context for runtime holes
  const ssrCtx = createRequestContext(url);
  for (const [key, data] of queryCache) {
    ssrCtx.queryCache.set(key, data);
  }
  if (session) ssrCtx.ssrAuth = session;

  // 5. Create AOT context with closure-based holes
  const holes = createHoles(module, ssrCtx, queryCache);
  const ctx: SSRAotContext = {
    holes,
    getData: (key) => queryCache.get(key),
    session: toPrefetchSession(session),
    params: matched.params,
  };

  // 6. Call compiled function
  const aotFn = await importAotFunction(aotRoute);
  const html = aotFn(queryCache, ctx);

  // 7. Collect CSS and SSR data (same pipeline as single-pass)
  const css = collectCSS(module);
  const ssrData = serializeQueryCache(queryCache);
  const headTags = collectHeadTags(module);

  return {
    html,
    css,
    ssrData,     // Required for client hydration — query cache rehydration
    headTags,    // Theme preload tags, meta tags
    redirect: ssrCtx.ssrRedirect ?? null,
    discoveredRoutes: ssrCtx.discoveredRoutes,
    matchedRoutePatterns: ssrCtx.matchedRoutePatterns,
  };
}
```

## Manifesto Alignment

### Principle 7: Performance is not optional

This is the primary motivation. AOT compilation targets a **3-20x speedup** on the render phase — the last remaining bottleneck after zero-discovery eliminated the discovery phase. We measure it (POC 1), benchmark it, and only ship it if the numbers prove out.

### Principle 1: If it builds, it works

The AOT transform is a **compiler feature**. If the build succeeds, the AOT functions produce correct HTML — verified by byte-identical comparison with DOM shim output in CI. No runtime discovery of whether a component is AOT-compatible.

### Principle 2: One way to do things

Developers don't choose between AOT and runtime rendering. The compiler decides based on static analysis. There's one way to write components — the compiler optimizes the SSR path transparently. The long-term goal is to maximize AOT coverage until the DOM shim fallback is rarely exercised.

### Principle 8: No ceilings

The DOM shim is a ceiling. It was a pragmatic choice (run the same component code on server and client), but it caps SSR performance at "interpret a virtual DOM and serialize it." AOT removes the ceiling by compiling to the optimal representation for SSR.

### Principle 3: AI agents are first-class users

No new API for developers or AI agents to learn. Components are written the same way. The compiler optimization is invisible. The only new concept is the `// @vertz-no-aot` pragma, which an AI agent would only use if directed.

## Non-Goals

1. **Full elimination of DOM shim** — The DOM shim remains for runtime fallback (components with reactive context, dialogs, lazy routes). AOT is an optimization layer on top, not a replacement.

2. **AOT for client-side rendering** — Client-side rendering still uses the DOM target. AOT is SSR-only — the client needs real DOM nodes for interactivity.

3. **Cross-request caching of AOT output** — AOT functions are deterministic for the same data, but we don't cache rendered HTML across requests. Cache invalidation complexity isn't worth it for sub-millisecond renders.

4. **AOT for streaming SSR** — Initial implementation targets string-based SSR. Streaming AOT (yielding chunks) is a future enhancement. The current streaming mechanism (Suspense boundaries via `renderToStream`) continues to work via the DOM shim fallback for timed-out queries.

5. **Per-component opt-in** — No `@aot` decorator. The compiler classifies components automatically and is conservative — any uncertain component falls back to runtime. The `// @vertz-no-aot` file pragma exists as an escape hatch for edge cases, documented but intentionally rare.

6. **AOT for third-party component libraries** — Only components compiled by the Vertz compiler get AOT. Third-party components render via runtime holes.

## Unknowns

### ~~1. Cross-component inlining depth~~ — RESOLVED (POC 3)

**Question:** How deep should the compiler inline child AOT functions into parents?

**Result:** Inlining provides no benefit. Function call overhead is negligible (V8/JSC optimize it). Inlined code is slightly slower (~0.9x) due to larger generated code hurting instruction cache. **Inlining removed from design.** AOT functions remain separate callable units — simpler compiler, no linking step.

### 2. Event handler stripping — RESOLVED

Event handlers (`onClick`, `onSubmit`) are stripped from AOT output — they are no-ops in SSR. The DOM shim ignores them, and hydration uses `data-v-id` markers (not `onclick` attributes) to attach handlers. Verified: the current HTML serializer does not emit event handler attributes.

### 3. Style object serialization — RESOLVED (POC 2 validated)

The existing `styleObjectToString()` function handles camelCase → kebab-case conversion. POC 2 verified byte-identical output with the DOM shim across all tested patterns (basic CSS, numeric auto-px, unitless props, vendor prefixes, CSS variables, null skipping). The AOT transformer emits calls to `styleObjectToString()` directly.

### 4. Interaction with future streaming AOT — DESIGN NEEDED (future)

Deferred to a future design. The current proposal uses DOM shim fallback for streaming cases. Once AOT string rendering is proven, we can design a streaming variant that yields template chunks.

### ~~5. Accurate render speedup~~ — RESOLVED (POC 1 validated)

POC 1 measured 4-6x speedup for tier 3 pages (conditional + list), 3-8x for tier 2 (single data-driven component), ∞ for tier 1 (static constants). The success threshold of 3x minimum is met across all tiers. Revised estimate: **4-6x for typical pages** (was "5-20x").

## Data Flow Map

No public generics are introduced by this feature. The data flow is:

```
BUILD TIME:
ComponentFile.tsx
  ↓ compileForSSRAot(source, options)
  ↓ ReactivityAnalyzer → classifies vars (static / reactive-source)
  ↓ JsxAnalyzer → classifies subtrees (static / data-driven / conditional)
  ↓ HydrationTransformer → classifies components (interactive / static)
  ↓ AotStringTransformer → generates string concatenation code
  ↓
ComponentFile.ssr-aot.ts
  exports __ssr_ComponentName(data, ctx): string
  ↓
linkAotFunctions(manifest) → inlines children, resolves holes
  ↓
AotManifest { components, routes }

REQUEST TIME:
URL + PrefetchManifest → matchRoute() → ManifestRoute
  ↓
AotManifest.routes[pattern] → AotRoute | null
  ↓ (null → fall back to ssrRenderSinglePass)
prefetchFromManifest(matched, manifest, session) → Map<string, unknown>
  ↓
createHoles(module, ssrCtx, queryCache) → SSRAotHoles (closures)
  ↓
SSRAotContext { holes, getData, session, params }
  ↓
__ssr_PageComponent(data, ctx) → HTML string
  ↓
SSRRenderResult { html, css, ssrData, headTags, redirect }
```

The `Props` type for each AOT function is the same concrete type from the original component definition — no generics are lost or introduced.

## E2E Acceptance Test

```typescript
describe('Feature: AOT-compiled SSR', () => {
  describe('Given a static component (no data dependencies)', () => {
    describe('When AOT rendering is invoked', () => {
      it('Then the output is a constant HTML string', () => {});
      it('Then no DOM shim nodes are allocated', () => {});
      it('Then the output matches DOM shim rendering byte-for-byte', () => {});
    });
  });

  describe('Given a data-driven component with props', () => {
    describe('When AOT rendering is invoked with data', () => {
      it('Then props values are HTML-escaped in output', () => {});
      it('Then the output matches DOM shim rendering for the same data', () => {});
    });
  });

  describe('Given a component with conditional rendering', () => {
    describe('When data triggers the truthy branch', () => {
      it('Then the truthy HTML is emitted', () => {});
      it('Then paired conditional comment markers are present', () => {});
    });
    describe('When data triggers the falsy branch', () => {
      it('Then paired comment markers surround empty content', () => {});
    });
  });

  describe('Given a component with list rendering (.map())', () => {
    describe('When data has 5 items', () => {
      it('Then 5 list items are emitted in order', () => {});
      it('Then list markers surround the rendered items', () => {});
      it('Then each item content is properly escaped', () => {});
    });
    describe('When data has 0 items', () => {
      it('Then paired list markers surround empty content', () => {});
    });
  });

  describe('Given a component with fragments (<>...</>)', () => {
    describe('When AOT rendering is invoked', () => {
      it('Then children are concatenated with no wrapper element', () => {});
    });
  });

  describe('Given a component with void elements (<input>, <img>)', () => {
    describe('When AOT rendering is invoked', () => {
      it('Then void elements have no closing tag', () => {});
    });
  });

  describe('Given a component with style objects', () => {
    describe('When AOT rendering is invoked', () => {
      it('Then camelCase styles are serialized to kebab-case CSS', () => {});
      it('Then output matches DOM shim style serialization', () => {});
    });
  });

  describe('Given a component with spread attributes', () => {
    describe('When AOT rendering is invoked', () => {
      it('Then spread props are serialized as HTML attributes', () => {});
      it('Then event handlers in spread are stripped', () => {});
      it('Then className in spread is rendered as class', () => {});
    });
  });

  describe('Given a component with an interactive child (has let declarations)', () => {
    describe('When AOT rendering is invoked', () => {
      it('Then the child has data-v-id attribute in output', () => {});
      it('Then reactive child markers are present', () => {});
      it('Then client hydration correctly attaches to the AOT-rendered HTML', () => {});
    });
  });

  describe('Given a component with a runtime hole (<Outlet />)', () => {
    describe('When AOT rendering is invoked', () => {
      it('Then the AOT shell renders via string concatenation', () => {});
      it('Then the hole is filled by DOM shim rendering via closure', () => {});
      it('Then the combined output matches full DOM shim rendering', () => {});
    });
  });

  describe('Given a page component with query() calls', () => {
    describe('When prefetched data is available', () => {
      it('Then AOT renders with data (no loading state)', () => {});
      it('Then ssrData is populated for client hydration', () => {});
    });
  });

  describe('Given a component that reads useAuth()', () => {
    describe('When AOT analysis runs', () => {
      it('Then the component is classified as runtime-fallback', () => {});
      it('Then DOM shim rendering is used (not AOT)', () => {});
    });
  });

  describe('Given a file with // @vertz-no-aot pragma', () => {
    describe('When AOT analysis runs', () => {
      it('Then all components in the file are classified as runtime-fallback', () => {});
    });
  });

  describe('Given the build configuration has ssr.aot: true', () => {
    describe('When vertz build runs', () => {
      // @ts-expect-error — per-component AOT options are not supported
      defineConfig({ ssr: { aot: { components: { ProjectCard: true } } } });
    });
  });
});
```

## Implementation Phases

Phase dependencies: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 (sequential). Phase 4 and 5 have partial overlap potential (doc updates can start during Phase 4).

### ~~Phase 0: POC~~ — COMPLETED

POC validated all three research questions. Results in "POC Results" section above. 23 tests passing at `packages/ui-server/src/__tests__/ssr-aot-poc.test.ts`.

### Phase 1: AotStringTransformer — Compiler Integration

**What:**
- `AotStringTransformer` in `packages/ui-compiler/src/transformers/`
- `compileForSSRAot()` entry point
- Handles all tiers: static, data-driven, conditional
- Handles: void elements, fragments, prop aliasing, style objects, spread attributes, raw text elements
- All four hydration marker types
- `__esc()` and helpers aligned with existing `escapeHtml()`
- Minimal SSR integration: `ssrRenderAot()` function that renders a single route via AOT

**Acceptance criteria:**

```typescript
describe('Feature: AotStringTransformer', () => {
  describe('Given a component with only static HTML', () => {
    describe('When compiled with compileForSSRAot()', () => {
      it('Then output is a string constant', () => {});
    });
  });

  describe('Given a component with prop references, conditionals, lists', () => {
    describe('When compiled with compileForSSRAot()', () => {
      it('Then output uses __esc() for text content', () => {});
      it('Then conditionals use paired comment markers', () => {});
      it('Then lists use .map().join("") with list markers', () => {});
    });
  });

  describe('Given a component with className, void elements, fragments', () => {
    describe('When compiled with compileForSSRAot()', () => {
      it('Then className maps to class attribute', () => {});
      it('Then void elements have no closing tag', () => {});
      it('Then fragments produce no wrapper element', () => {});
    });
  });

  describe('Given ssrRenderAot() with a fully AOT route', () => {
    describe('When rendering the route', () => {
      it('Then HTML output matches ssrRenderSinglePass()', () => {});
      it('Then ssrData is populated for hydration', () => {});
      it('Then render is measurably faster', () => {});
    });
  });
});
```

### Phase 2: Runtime Holes and SSR Pipeline Integration

**What:**
- Closure-based `createHoles()` with full `ssrStorage` context
- AOT manifest generation (component → tier mapping, per-route AOT entry)
- `// @vertz-no-aot` pragma support
- `ssrRenderAot()` function with graceful fallback to `ssrRenderSinglePass()`
- Cross-component AOT function references (function calls, NOT inlining — per POC 3)

**Acceptance criteria:**

```typescript
describe('Feature: Runtime holes and SSR integration', () => {
  describe('Given a component with a runtime hole', () => {
    describe('When AOT rendering is invoked', () => {
      it('Then the AOT shell renders via string concatenation', () => {});
      it('Then the hole closure runs inside ssrStorage context', () => {});
      it('Then useContext() works inside the hole', () => {});
      it('Then query() data is shared between AOT and hole', () => {});
    });
  });

  describe('Given a fully AOT-compiled route', () => {
    describe('When ssrRenderAot() is called', () => {
      it('Then the AOT function is called (no DOM shim)', () => {});
      it('Then HTML output matches ssrRenderSinglePass()', () => {});
      it('Then ssrData is populated for hydration', () => {});
      it('Then render is at least 3x faster', () => {});
    });
  });

  describe('Given a route not in AOT manifest', () => {
    describe('When ssrRenderAot() is called', () => {
      it('Then falls back to ssrRenderSinglePass()', () => {});
    });
  });

  describe('Given a file with // @vertz-no-aot pragma', () => {
    describe('When AOT compilation runs', () => {
      it('Then all components in the file use runtime fallback', () => {});
    });
  });
});
```

### Phase 3: Hydration Compatibility and E2E Validation

**What:**
- Hydration marker parity tests (all four marker types)
- Client hydration E2E tests with Playwright
- Performance benchmarks on the linear clone (all pages)
- Byte-identical comparison CI gate

**Acceptance criteria:**

```typescript
describe('Feature: AOT hydration compatibility', () => {
  describe('Given AOT-rendered HTML for IssueListPage', () => {
    describe('When the client hydrates', () => {
      it('Then all interactive components attach event handlers', () => {});
      it('Then clicking a filter button updates the list', () => {});
      it('Then no hydration mismatch warnings are logged', () => {});
    });
  });

  describe('Given the full linear clone rendered via AOT', () => {
    describe('When benchmarked against DOM shim', () => {
      it('Then /projects renders at least 5x faster', () => {});
      it('Then /projects/:id renders at least 3x faster', () => {});
      it('Then HTML output is byte-identical', () => {});
    });
  });
});
```

### Phase 4: DX Polish and Diagnostics

**What:**
- Diagnostic endpoint (`/__vertz_ssr_aot`, dev mode only)
- Dev-mode divergence detection (dual render + diff)
- `VERTZ_DEBUG=aot` logging with per-component classification
- Build step integration (`vertz build` generates AOT manifest)
- Dev server: AOT manifest hot rebuild on file change

### Phase 5: Documentation

- Update `packages/docs/` with AOT SSR documentation
- Architecture decision record
- Performance benchmarks published

## Precedent

| Framework | Approach | SSR speed (relative) |
|---|---|---|
| **Marko** (eBay) | Compiled string concatenation, streaming | Fastest in JS Framework Benchmark SSR |
| **Svelte** | SSR compiles to string builders | 3-10x vs VDOM frameworks |
| **SolidStart** | JSX → string concatenation for SSR | Similar to Svelte |
| **Qwik** | Resumable SSR (serialize state, no hydration) | Fast initial load, different tradeoff |
| **React** | `renderToString()` with VDOM | Baseline (what we're currently closer to) |

Vertz's AOT approach is most similar to Svelte and Marko — compile-time knowledge of component structure, direct string output, no virtual DOM intermediary.

## Risks

1. **Hydration divergence** — If AOT output differs from DOM shim output by even one character, hydration breaks. Mitigation: byte-identical comparison CI gate, dev-mode dual rendering with diff detection, all four hydration marker types explicitly handled.

2. **Maintenance burden** — Two rendering paths (DOM shim + AOT) means rendering changes must be considered for both. Mitigation: the AOT transformer reuses the compiler's existing analysis; rendering logic is expressed once in JSX, compiled to two targets. The long-term goal is to maximize AOT coverage until DOM shim fallback is rare.

3. **Debugging difficulty** — When SSR output is wrong, developers can't easily trace through the AOT function. Mitigation: source maps linking AOT output back to original JSX, diagnostic endpoint, `VERTZ_DEBUG=aot` logging, dev-mode divergence detection.

4. **Compile time increase** — AOT analysis and codegen add to build time. Mitigation: the per-file single-pass architecture means AOT is O(n) in component count. The linking step is O(n). Success criterion: no more than 15% build time increase.

5. **renderHole() context switching overhead** — Each runtime hole requires setting up `ssrStorage` context, creating SSR render context, and running DOM shim rendering. Mitigation: holes are expected to be rare (2-5 per page maximum). The overhead is included in performance estimates (~0.005ms per hole).

## Resolved Blockers (from Rev 1 three-agent review)

### ~~1. Missing POC Results section~~

**Source:** Product BLOCKER-1, DX BLOCKER-1

**Resolution:** Added "POC Results" section with three planned POCs. Phase 0 is a gate — POC must validate performance claims before implementation begins. Success threshold: 3x minimum for pages with holes, 5x for fully AOT pages.

### ~~2. No feature-level success criteria~~

**Source:** Product BLOCKER-2

**Resolution:** Added "Success Criteria" section with concrete thresholds: render speedup minimums, HTML parity requirement, hydration parity, build time limit, coverage target.

### ~~3. `SSRResult` return type incomplete~~

**Source:** DX BLOCKER-2

**Resolution:** Updated `ssrRenderAot()` to return full `SSRRenderResult` including `ssrData` (for client query cache rehydration), `headTags` (theme preload), `redirect`, `discoveredRoutes`, and `matchedRoutePatterns`.

### ~~4. `renderHole()` stringly-typed and ambiguous~~

**Source:** DX BLOCKER-3, Technical BLOCKER-2

**Resolution:** Redesigned holes as **closure-based**, not string-based. Each hole is a pre-built closure that captures the component factory, SSR context (`ssrStorage`), `ContextScope`, and query cache. No string-based component lookup. Closures run inside `ssrStorage.run()` for full SSR context (useContext, query, etc.).

### ~~5. Hydration marker model incomplete~~

**Source:** Technical BLOCKER-1

**Resolution:** Added all four hydration marker types: `data-v-id` attributes, paired `<!--conditional-->` / `<!--/conditional-->` markers, `<!--child-->` / `<!--/child-->` markers, and `<!--list-->` / `<!--/list-->` markers. Each marker type has explicit AOT output examples and parity guarantees.

### ~~6. Compiler pipeline architecture~~

**Source:** Technical BLOCKER-3

**Resolution:** AOT uses a separate `compileForSSRAot()` entry point that shares analyzers (ComponentAnalyzer, ReactivityAnalyzer, JsxAnalyzer) but uses different transformers (AotStringTransformer instead of SignalTransformer + JSXTransformer). No conditional branches in existing `compile()`. Detailed pipeline comparison table added.

### ~~7. Fragment handling missing~~

**Source:** Technical BLOCKER-4

**Resolution:** Added explicit fragment handling section with examples. Fragments produce concatenated children with no wrapper element. Works correctly when inlined into parents.

### How should-fixes were addressed

| Finding | Resolution |
|---|---|
| ROI overstated for I/O-bound pages (Prod-SF1) | Added "Developer impact" section with honest framing: CPU savings, throughput, edge deployment — not just user-visible speed |
| Timing question (Prod-SF2) | Added "Why Now" section: Vertz Cloud edge, build-in-public, foundation ready |
| No escape hatch (Prod-SF3) | Added `// @vertz-no-aot` file-level pragma |
| Phase 1 not vertical slice (Prod-SF4) | Phase 1 now includes minimal SSR integration (`ssrRenderAot()`). Phase 0 (POC) is the benchmark demo. |
| No divergence detection (DX-SF1) | Added dev-mode dual rendering with diff via WebSocket error channel |
| Tier classification invisible (DX-SF2) | Added `VERTZ_DEBUG=aot` logging and build-time classification output |
| Component inlining mechanism (DX-SF3, Tech-SF5) | Specified as separate `linkAotFunctions()` linking step after per-file compilation |
| `__esc_attr` differs from `__esc` (DX-SF4) | Made `__esc_attr` an alias for `__esc` — single escaping function |
| `@ts-expect-error` example misleading (DX-SF5) | Replaced with `defineConfig()` type error example |
| `__esc` diverges from existing `escapeHtml` (Tech-SF1) | Aligned: escapes `& < > "` (not `'`), handles arrays recursively |
| Void elements (Tech-SF2) | Added void elements section with example |
| Style objects (Tech-SF3) | Moved from "NEEDS POC" to use existing `styleObjectToString()`. POC 2 verifies parity. |
| Spread attributes (Tech-SF4) | Added `__ssr_spread()` helper with full implementation |
| `className`/`htmlFor` aliasing (Tech-SF6) | Added prop aliasing section |
| `renderHole()` performance overhead (Tech-SF7) | Added ~0.005ms per-hole estimate to performance model caveats |
| Missing POC Results section header (Tech-SF8) | Added section with "Pending" status |
