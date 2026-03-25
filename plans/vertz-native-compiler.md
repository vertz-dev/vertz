# Vertz Native Compiler — Implementation Plan (Phase 0)

> "If the runtime is too slow, we build a faster one." — Vertz Vision, Principle 8

## Parent Design Doc

`plans/vertz-runtime.md` — This plan implements **Phase 0** only, which is a standalone project with independent value regardless of whether the full runtime is ever built.

## Goal

Replace the TypeScript compiler (ts-morph + MagicString, ~50-200ms per file) with a native Rust compiler (oxc, ~1-5ms per file). Delivered as a **NAPI module** that plugs into the existing Bun dev server — zero changes to the developer experience.

## What We're Porting

The Vertz UI compiler is ~25K lines of TypeScript across:
- **6 analyzers** (~2,320 lines) — read-only AST analysis, produce metadata
- **11 transformers** (~4,536 lines) — mutate source text via MagicString
- **~6,400 lines of tests** — the compatibility contract

### Architecture Difference

**Current (TypeScript):** Multi-pass. ts-morph parses → analyzers walk the AST → transformers mutate MagicString (text-level edits) → MagicString generates source map. Critical: JSX transformer reads MagicString output (`.slice()`) to pick up `.value` insertions from prior transforms.

**Target (Rust):** Two-pass. oxc parses → single analysis walk collects all metadata → single transform walk applies all mutations in dependency order → oxc codegen + source map. No MagicString — mutations are AST-level via oxc's `Traverse` trait.

**This is a fundamental rewrite, not a port.** The data flow, mutation model, and pass structure are different. The contract is: semantically equivalent output, validated by the existing test suite.

## Non-Goals

- Changing any public API (this is invisible to developers)
- SSR AOT compilation (AotStringTransformer — defer to later; ts-morph handles it for now)
- Route splitting (RouteSplittingTransformer — defer)
- CSS extraction to sidecar files (CSSExtractor — defer)
- Manifest generation (cross-file analysis — defer; ts-morph handles it for now)
- Field selection analysis (FieldSelectionAnalyzer — defer)

These are SSR/build-time features that run infrequently. The hot path (dev-time per-file compilation) is what we're optimizing.

## Phased Implementation

### Phase 0.1: Rust Scaffold + oxc POC (2 weeks)

**Goal:** Prove we can parse TypeScript with oxc, apply a simple transform, and call it from JavaScript via NAPI.

**Deliverables:**
- Rust crate `vertz-compiler` with Cargo workspace
- oxc parser integration — parse a `.tsx` file, walk the AST
- Simplest possible transform: inject `// compiled by vertz-native` comment at top
- NAPI binding via `napi-rs` — export `compile(source: string, options?: object): { code: string, map?: string }`
- Bun can `require()` the `.node` module and call `compile()`
- CI builds the native module for macOS arm64 (dev machine target)

**Acceptance criteria:**

```typescript
describe('Feature: Native compiler NAPI binding', () => {
  describe('Given a TypeScript source string', () => {
    describe('When compile() is called via the NAPI binding', () => {
      it('Then returns transformed code as a string', () => {
        const { compile } = require('./vertz-compiler.node');
        const result = compile('const x = 1;', { filename: 'test.ts' });
        expect(result.code).toContain('// compiled by vertz-native');
        expect(typeof result.code).toBe('string');
      });
    });
  });

  describe('Given invalid syntax', () => {
    describe('When compile() is called', () => {
      it('Then returns diagnostics with line/column info', () => {
        const result = compile('const = ;', { filename: 'bad.ts' });
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics[0].line).toBeDefined();
      });
    });
  });
});
```

**Kill gate:** If `napi-rs` + oxc integration has fundamental blockers after 2 weeks, pause and evaluate alternatives (Wasm instead of NAPI, or `swc` instead of oxc).

---

### Phase 0.2: Component Analysis + Reactivity Analysis (3 weeks)

**Goal:** Port the two foundational analyzers that every transformer depends on. These are read-only (no mutations) — pure AST walking that produces metadata.

**What we're porting:**
- `ComponentAnalyzer` (194 lines) — detects function components with JSX returns
- `ReactivityAnalyzer` (512 lines) — classifies variables as signal/computed/static
- `signal-api-registry.ts` (65 lines) — known API database (query, form, createLoader, can)

**Key challenge:** The ReactivityAnalyzer does two-pass analysis:
1. Collect all `let`/`const` declarations and build a dependency graph
2. From JSX-referenced identifiers, trace backwards to find which `let` variables become signals

This is algorithmically straightforward but requires careful symbol resolution (import aliases, destructured bindings, synthetic variables for signal APIs).

**Acceptance criteria:**

```typescript
describe('Feature: Component detection in native compiler', () => {
  describe('Given a file with a named function returning JSX', () => {
    describe('When analyzed', () => {
      it('Then detects the component with correct name and body range', () => {
        const result = compile('function TaskCard() { return <div />; }');
        // Verify via internal metadata or by checking transform output matches TS version
      });
    });
  });

  describe('Given a file with a const arrow function returning JSX', () => {
    describe('When analyzed', () => {
      it('Then detects the component', () => {
        const result = compile('const TaskCard = () => <div />;');
        // Same verification
      });
    });
  });
});

describe('Feature: Reactivity classification', () => {
  describe('Given a let variable referenced in JSX', () => {
    describe('When analyzed', () => {
      it('Then classifies it as a signal', () => {
        const source = `
          function Counter() {
            let count = 0;
            return <div>{count}</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('signal(0');
      });
    });
  });

  describe('Given a const derived from a signal variable', () => {
    describe('When analyzed', () => {
      it('Then classifies it as computed', () => {
        const source = `
          function Counter() {
            let count = 0;
            const doubled = count * 2;
            return <div>{doubled}</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('computed(');
      });
    });
  });

  describe('Given a query() call with signal properties', () => {
    describe('When analyzed', () => {
      it('Then classifies data/loading/error as signal properties', () => {
        const source = `
          function TaskList() {
            const tasks = query(() => fetchTasks());
            return <div>{tasks.data}</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('.data.value');
      });
    });
  });
});
```

**Verification strategy:** Run the existing TypeScript compiler and the Rust compiler on the same inputs. Compare analysis metadata (component names, variable classifications). Differences = bugs.

---

### Phase 0.3: Signal + Computed + Mutation Transforms (3 weeks)

**Goal:** Port the three core reactive transforms. These are the simplest mutating transforms — they wrap declarations and insert `.value` accessors.

**What we're porting:**
- `SignalTransformer` (295 lines) — `let x = 5` → `const x = signal(5, 'x')`, references → `.value`
- `ComputedTransformer` (160 lines) — `const x = expr` → `const x = computed(() => expr)`
- `MutationAnalyzer` (136 lines) + `MutationTransformer` (143 lines) — detect `count++`, `obj.x = 5` → insert `peek()`/`notify()` calls

**Key challenge for Rust:** These transforms in TypeScript use MagicString (text-level mutations with position tracking). In Rust, we need either:
- **Option A:** oxc's `Traverse` with in-place AST mutation + codegen — cleanest, but requires rethinking how transforms compose
- **Option B:** A Rust string mutation library similar to MagicString — `overwrite(start, end, replacement)` with source map generation
- **Recommendation:** Start with Option A for simple transforms. If AST mutation proves too limiting for JSX (Phase 0.4), build Option B.

**Acceptance criteria:**

```typescript
describe('Feature: Signal transform', () => {
  describe('Given a let variable in a component', () => {
    describe('When compiled', () => {
      it('Then wraps in signal() with HMR key', () => {
        const source = 'function App() { let count = 0; return <div>{count}</div>; }';
        const result = compile(source);
        expect(result.code).toContain("signal(0, 'count')");
        expect(result.code).not.toContain('let count');
      });
    });
  });

  describe('Given a signal variable referenced outside JSX', () => {
    describe('When compiled', () => {
      it('Then inserts .value on references', () => {
        const source = `
          function App() {
            let count = 0;
            const handler = () => { console.log(count); };
            return <div>{count}</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('count.value');
      });
    });
  });
});

describe('Feature: Mutation transform', () => {
  describe('Given count++ on a signal variable', () => {
    describe('When compiled', () => {
      it('Then wraps with peek/notify pattern', () => {
        const source = `
          function App() {
            let count = 0;
            return <button onClick={() => { count++; }}>{count}</button>;
          }
        `;
        const result = compile(source);
        // Mutation should use peek() to get raw value and notify() after
        expect(result.code).toContain('notify(');
      });
    });
  });
});
```

**Gold standard test:** Run every test in `packages/ui-compiler/src/transformers/__tests__/signal-transformer.test.ts`, `computed-transformer.test.ts`, and `mutation-transformer.test.ts` against the Rust compiler output. **100% pass rate required.**

---

### Phase 0.4: Props Destructuring + Mount Frame (2 weeks)

**Goal:** Port the two structural transforms that reshape component function signatures and return statements.

**What we're porting:**
- `PropsDestructuringTransformer` (239 lines) — `function X({ title, id }) {}` → `function X(__props) { const title = __props.title; ... }`
- `MountFrameTransformer` (173 lines) — wraps return expressions with `__pushMountFrame()` / `__flushMountFrame()`

**Key detail:** Props destructuring runs BEFORE reactivity analysis (it changes the AST shape that the analyzer reads). Mount frame runs AFTER JSX transform. The Rust pipeline must respect this ordering.

**Acceptance criteria:**

```typescript
describe('Feature: Props destructuring', () => {
  describe('Given a component with destructured props', () => {
    describe('When compiled', () => {
      it('Then converts to __props access pattern', () => {
        const source = `
          function TaskCard({ title, onClick }: TaskCardProps) {
            return <div onClick={onClick}>{title}</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('__props');
        expect(result.code).not.toContain('{ title, onClick }');
      });
    });
  });

  describe('Given a component with default prop values', () => {
    describe('When compiled', () => {
      it('Then preserves defaults via nullish coalescing', () => {
        const source = `
          function Badge({ variant = 'default' }: BadgeProps) {
            return <span>{variant}</span>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain("?? 'default'");
      });
    });
  });

  describe('Given a component with rest props', () => {
    describe('When compiled', () => {
      it('Then handles rest spread correctly', () => {
        const source = `
          function Button({ children, ...rest }: ButtonProps) {
            return <button {...rest}>{children}</button>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('__props');
      });
    });
  });
});

describe('Feature: Mount frame wrapping', () => {
  describe('Given a component with a return statement', () => {
    describe('When compiled', () => {
      it('Then wraps return with mount frame push/flush', () => {
        const source = `
          function App() {
            let count = 0;
            return <div>{count}</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('__pushMountFrame');
        expect(result.code).toContain('__flushMountFrame');
      });
    });
  });
});
```

---

### Phase 0.5: JSX Transform (4 weeks)

**Goal:** Port the most complex transform — the JSX transformer (1,179 lines). This is the heart of the compiler.

**What we're porting:**
- `JsxAnalyzer` (470 lines) — classifies JSX expressions as reactive vs static
- `JsxTransformer` (1,179 lines) — transforms JSX into `__element()`, `__child()`, `__list()`, `__conditional()` calls

**Key challenges:**
1. **Recursive JSX tree traversal** — components, HTML elements, fragments, conditionals, lists, nested combinations
2. **Reactive prop detection** — `class={isActive}` → `class: () => isActive.value` (getter) vs `class="static"` → `class: 'static'` (literal)
3. **Cross-transform dependency** — In TypeScript, the JSX transformer reads from MagicString to get signal `.value` insertions. In Rust, the analysis pass must collect enough metadata so the JSX transform knows which expressions are reactive WITHOUT reading prior transform output.
4. **Whitespace normalization** — JSX text follows React/Babel rules (trim leading/trailing whitespace around newlines)
5. **Callback-local const inlines** — For list rendering, local consts inside callbacks are inlined into getter bodies

**Solution for cross-transform dependency:** The analysis pass already classifies every variable and every JSX expression as reactive or static. The JSX transform uses this classification directly — it doesn't need to read `.value` from prior output. Instead, when emitting a reactive expression, it wraps it in a getter AND inserts `.value` on signal references in one step. This is actually cleaner than the TypeScript approach where signal transform and JSX transform independently add `.value`.

**Acceptance criteria:**

```typescript
describe('Feature: JSX element transform', () => {
  describe('Given a simple HTML element', () => {
    describe('When compiled', () => {
      it('Then produces __element() call', () => {
        const source = `
          function App() {
            return <div class="container">Hello</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain("__element('div'");
      });
    });
  });

  describe('Given a component call with reactive props', () => {
    describe('When compiled', () => {
      it('Then wraps reactive props in getter functions', () => {
        const source = `
          function App() {
            let isActive = false;
            return <Badge variant={isActive ? 'active' : 'inactive'} />;
          }
        `;
        const result = compile(source);
        // Reactive prop should be a getter
        expect(result.code).toContain('() =>');
      });
    });
  });

  describe('Given a conditional JSX expression', () => {
    describe('When compiled', () => {
      it('Then produces __conditional() call', () => {
        const source = `
          function App() {
            let isOpen = false;
            return <div>{isOpen && <span>Open</span>}</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('__conditional');
      });
    });
  });

  describe('Given a list rendering with .map()', () => {
    describe('When compiled', () => {
      it('Then produces __list() call', () => {
        const source = `
          function App() {
            const tasks = query(() => fetchTasks());
            return <ul>{tasks.data.map(t => <li key={t.id}>{t.title}</li>)}</ul>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain('__list');
      });
    });
  });
});
```

**Gold standard:** Run ALL tests from `packages/ui-compiler/src/transformers/__tests__/jsx-transformer.test.ts` and `packages/ui-compiler/src/__tests__/integration.test.ts` against Rust output. Target: **100% pass rate**.

---

### Phase 0.6: CSS Transform + Fast Refresh + Context Stable IDs (2 weeks)

**Goal:** Port the remaining dev-time transforms.

**What we're porting:**
- `CSSAnalyzer` (171 lines) + `CSSTransformer` (459 lines) — `css({...})` → extracted class names
- Fast Refresh codegen — component registration for HMR
- Context stable ID injection — `createContext()` → `createContext(default, 'path::Name')`

**Key challenge:** CSS transform requires theme token resolution (spacing scale, color namespaces). These tokens must be passed into the Rust compiler at initialization or loaded from a manifest.

**Acceptance criteria:**

```typescript
describe('Feature: CSS extraction transform', () => {
  describe('Given a css() call with static token strings', () => {
    describe('When compiled', () => {
      it('Then replaces with generated class name map', () => {
        const source = `
          function App() {
            const styles = css({ panel: ['bg:background', 'p:4'] });
            return <div class={styles.panel}>Hello</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).not.toContain("css({");
        expect(result.css).toBeDefined();
      });
    });
  });
});

describe('Feature: Fast Refresh registration', () => {
  describe('Given a component', () => {
    describe('When compiled in dev mode', () => {
      it('Then registers component for Fast Refresh', () => {
        const source = 'function TaskCard() { return <div />; }';
        const result = compile(source, { fastRefresh: true });
        expect(result.code).toContain('__register');
      });
    });
  });
});

describe('Feature: Context stable IDs', () => {
  describe('Given a createContext() call at module level', () => {
    describe('When compiled with fastRefresh enabled', () => {
      it('Then injects stable ID string', () => {
        const source = "const Ctx = createContext<string>();";
        const result = compile(source, { filename: 'src/ctx.tsx', fastRefresh: true });
        expect(result.code).toContain("'src/ctx.tsx::Ctx'");
      });
    });
  });
});
```

---

### Phase 0.7: Source Maps + Import Injection + Diagnostics (2 weeks)

**Goal:** Complete the compilation pipeline — accurate source maps, automatic runtime imports, and developer-facing diagnostics.

**What we're porting:**
- Source map generation (v3 format) from oxc's codegen
- Import statement injection — scan output for `signal()`, `__element()`, etc., prepend correct imports
- `SsrSafetyDiagnostics` (179 lines) — warns about SSR-unsafe patterns
- `CssDiagnostics` (203 lines) — warns about CSS issues
- `MutationDiagnostics` (110 lines) — warns about mutation patterns
- `BodyJsxDiagnostics` (81 lines) — warns about JSX in variable initializers

**Key challenge:** Source map accuracy. Every transformed line must map back to the correct original position. This is critical for stack traces in the dev server error overlay and Chrome DevTools.

**Acceptance criteria:**

```typescript
describe('Feature: Source maps', () => {
  describe('Given compiled output', () => {
    describe('When mapping a transformed line back to source', () => {
      it('Then points to the correct original line and column', () => {
        const source = `function App() {\n  let count = 0;\n  return <div>{count}</div>;\n}`;
        const result = compile(source, { filename: 'App.tsx' });
        const map = JSON.parse(result.map);
        expect(map.version).toBe(3);
        expect(map.sources).toContain('App.tsx');
        // Verify specific mapping accuracy with @jridgewell/trace-mapping
      });
    });
  });
});

describe('Feature: Import injection', () => {
  describe('Given a compiled component using signals and elements', () => {
    describe('When imports are injected', () => {
      it('Then includes only the used runtime functions', () => {
        const source = `
          function App() {
            let count = 0;
            return <div>{count}</div>;
          }
        `;
        const result = compile(source);
        expect(result.code).toContain("import { signal");
        expect(result.code).toContain("from '@vertz/ui/internals'");
      });
    });
  });
});
```

---

### Phase 0.8: Integration + Bun Plugin Swap + Benchmarks (3 weeks)

**Goal:** Wire the native compiler into the existing Bun dev server as a drop-in replacement. Run ALL existing tests. Benchmark.

**What we're building:**
- Update `packages/ui-server/src/bun-plugin/plugin.ts` to call native compiler when available, fallback to ts-morph
- Feature flag: `VERTZ_NATIVE_COMPILER=1` enables the native compiler
- Run the full existing test suite against native compiler output
- Benchmark: per-file compilation time, cold start with 50 files, HMR latency

**Integration approach:**
```typescript
// In bun-plugin/plugin.ts
const nativeCompiler = tryLoadNativeCompiler(); // Returns null if .node not found

build.onLoad({ filter: /\.tsx$/ }, async (args) => {
  const source = await Bun.file(args.path).text();

  if (nativeCompiler) {
    // Native path — ~1-5ms
    const result = nativeCompiler.compile(source, {
      filename: args.path,
      target: 'dom',
      fastRefresh: options.fastRefresh,
    });
    return { contents: result.code, loader: 'ts' };
  }

  // Fallback — existing ts-morph path (~50-200ms)
  const result = compile(source, { filename: args.path, target: 'dom' });
  return { contents: result.code, loader: 'ts' };
});
```

**Acceptance criteria:**

```typescript
describe('Feature: End-to-end native compiler integration', () => {
  describe('Given the linear-clone example app', () => {
    describe('When built with the native compiler', () => {
      it('Then produces identical behavior to the ts-morph compiler', async () => {
        // Build with ts-morph
        const tsResult = await buildWithTsMorph('examples/linear-clone');
        // Build with native
        const nativeResult = await buildWithNative('examples/linear-clone');
        // Compare: same routes render same HTML, same client bundle executes
      });
    });
  });

  describe('Given a file save during dev', () => {
    describe('When HMR processes the change with native compiler', () => {
      it('Then browser updates in under 50ms', async () => {
        const dev = await startDevServer({ nativeCompiler: true });
        const start = performance.now();
        await dev.editFile('src/App.tsx', code => code.replace('Hello', 'World'));
        await dev.waitForHmr();
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);
      });
    });
  });
});
```

**Benchmark targets:**

| Metric | ts-morph (current) | Native (target) | Improvement |
|---|---|---|---|
| Single file compilation | 50-200ms | 1-5ms | 20-50x |
| 50-file cold start | 5-10s | 100-250ms | 20-40x |
| HMR (file save → browser) | 100-300ms | <50ms | 3-6x |

---

## Cross-Cutting Concerns

### Test Strategy

Every phase runs two test suites:
1. **New Rust-specific tests** — written as BDD acceptance criteria above
2. **Existing TypeScript tests** — the gold standard. Every test in `packages/ui-compiler/src/__tests__/` runs against both compilers. Any difference = bug in the Rust compiler.

**Comparison harness:** A test utility that compiles the same source with both compilers and asserts semantic equivalence (whitespace/formatting differences are acceptable; behavioral differences are not).

### CI Matrix

The native compiler builds for:
- macOS arm64 (primary dev machine — built in every phase)
- macOS x64 (CI runners — added in Phase 0.8)
- Linux x64 (CI/CD — added in Phase 0.8)

### Rollback Strategy

The native compiler is behind `VERTZ_NATIVE_COMPILER=1`. If any issue is found, the team immediately falls back to ts-morph. No developer is ever blocked by a Rust compiler bug.

### What We're NOT Porting (deferred)

These stay on ts-morph for now:
- `AotStringTransformer` (1,194 lines) — SSR AOT, runs at build time only
- `RouteSplittingTransformer` (503 lines) — code splitting, build time only
- `ManifestGenerator` (560 lines) — cross-file analysis, build time only
- `FieldSelectionAnalyzer` (600 lines) — SSR optimization, build time only
- `CSSExtractor` — separate concern from compilation
- `HydrationTransformer` (130 lines) — SSR-specific

These represent ~3,000 lines that only matter at build time, not dev time. The hot path (per-file dev compilation) is fully covered by Phases 0.1-0.7.

---

## Timeline

| Phase | Duration | Cumulative |
|---|---|---|
| 0.1: Rust scaffold + NAPI POC | 2 weeks | 2 weeks |
| 0.2: Component + Reactivity analysis | 3 weeks | 5 weeks |
| 0.3: Signal + Computed + Mutation transforms | 3 weeks | 8 weeks |
| 0.4: Props destructuring + Mount frame | 2 weeks | 10 weeks |
| 0.5: JSX transform | 4 weeks | 14 weeks |
| 0.6: CSS + Fast Refresh + Context IDs | 2 weeks | 16 weeks |
| 0.7: Source maps + Imports + Diagnostics | 2 weeks | 18 weeks |
| 0.8: Integration + Benchmarks | 3 weeks | 21 weeks |

**Total: ~5 months (21 weeks)**

Optimistic: 4 months (if JSX transform is smoother than expected)
Pessimistic: 7 months (if oxc API requires workarounds or CJS interop issues)

### Kill Criteria

| Checkpoint | Question | Kill if... |
|---|---|---|
| Phase 0.1 complete | Does NAPI + oxc work? | Can't parse TSX or call from Bun |
| Phase 0.3 complete (8 weeks) | Are transforms working in oxc? | <50% of signal/computed tests pass |
| Phase 0.5 complete (14 weeks) | Is JSX transform viable? | <80% of JSX tests pass after 4 weeks of effort |
| Phase 0.8 complete | Is it actually faster? | <5x improvement over ts-morph |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| oxc `Traverse` API insufficient for complex transforms | Low | High | POC in Phase 0.1. Fallback: hybrid (oxc parse + Rust string mutation) |
| Source map accuracy issues | Medium | Medium | Compare every source map against ts-morph output. Use `@jridgewell/trace-mapping` for validation |
| NAPI overhead negates compilation speed gains | Low | Medium | Measure in Phase 0.1. If >5ms overhead per call, use batch API (compile multiple files per NAPI call) |
| CSS theme token resolution needs full theme loaded in Rust | Medium | Low | Pass tokens as JSON config at compiler init. Cache across compilations |
| Platform-specific build issues (macOS/Linux) | Medium | Low | CI matrix from Phase 0.8. napi-rs handles cross-compilation |
