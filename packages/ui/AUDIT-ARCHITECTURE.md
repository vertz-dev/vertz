# @vertz/ui Architecture Audit

**Date:** 2026-02-21
**Auditor:** Architecture Review (Subagent)
**Scope:** Deep architecture audit of `packages/ui/src/`

---

## Executive Summary

`@vertz/ui` is a well-architected reactive UI framework with clear separation between its core reactive runtime, component model, and higher-level abstractions (forms, router, query, CSS). The package demonstrates strong architectural decisions including a dedicated "internals" export path for compiler integration and curated public subpath exports. A few areas warrant attention, primarily around a subtle runtime-component dependency cycle and potential extensibility gaps.

---

## Architectural Strengths

### 1. Clear Module Boundaries (HIGH PRIORITY)

The package has excellent logical organization:

```
src/
├── runtime/        # Core reactivity (signals, effects, disposal, scheduling)
├── component/      # Component model (context, lifecycle, error boundaries, suspense)
├── dom/           # DOM primitives (compiler output targets)
├── css/           # CSS-in-JS with token system
├── form/          # Form handling with schema validation
├── router/        # Client-side routing with loaders
├── query/         # Data fetching with caching
├── store/         # Normalized entity cache
├── hydrate/       # SSR hydration infrastructure
├── test/          # Testing utilities
└── jsx-runtime/   # Dev-time JSX runtime
```

Each module has a single, well-defined responsibility. Dependencies flow primarily downward (higher-level modules depend on lower-level ones).

### 2. Dual Export Strategy (HIGH PRIORITY)

The `package.json` exports are well-designed:

```json
{
  ".": "Public API for application developers",
  "./internals": "Compiler-internal exports (explicitly documented as not for apps)",
  "./test": "Testing utilities",
  "./jsx-runtime": "JSX automatic runtime",
  "./css": "CSS-only subpath",
  "./form": "Form-only subpath",
  "./router": "Router-only subpath",
  "./query": "Query-only subpath"
}
```

This separation:
- Keeps internal implementation details hidden from consumers
- Provides explicit contracts for the `@vertz/ui-compiler` integration
- Allows tree-shaking and reduces bundle sizes for partial consumers
- Documents intent clearly in `internals.ts` header comment

### 3. Pure Reactive Runtime (HIGH PRIORITY)

The `runtime/` module is exceptionally clean:

- **`signal-types.ts`**: Pure type definitions with zero dependencies
- **`signal.ts`**: Core reactivity implementation
- **`disposal.ts`**: Cleanup scope management
- **`scheduler.ts`**: Batched update scheduling
- **`tracking.ts`**: Dependency tracking

This is a true foundation layer that could be extracted as a standalone package.

### 4. Token-Based CSS System (MEDIUM PRIORITY)

The CSS module (`css/`) has excellent architecture:

- **`token-tables.ts`**: Single source of truth for all CSS tokens (spacing, colors, shadows, etc.)
- **`token-resolver.ts`**: Token resolution with validation
- **`shorthand-parser.ts`**: Parses shorthand like `p:4` → `padding: 1rem`
- **`variants.ts`**: Type-safe variant system inspired by Stitches/CVA

The `variants()` function provides excellent TypeScript inference:
```ts
const button = variants({
  base: ['flex', 'rounded:md'],
  variants: { intent: { primary: ['bg:blue.500'], secondary: ['bg:gray.100'] } },
  compoundVariants: [...]
});
// TypeScript knows: button({ intent: 'primary' | 'secondary' })
```

### 5. Signal-First Design (MEDIUM PRIORITY)

The reactive model is signal-centric (similar to SolidJS/Preact Signals):

- Signals hold mutable state with automatic dependency tracking
- Computeds are lazy and cached
- Effects auto-dispose when created inside a scope
- Context scope is captured by effects for async callbacks

This design enables fine-grained reactivity without virtual DOM overhead.

### 6. Testing Infrastructure (MEDIUM PRIORITY)

The `test/` module provides:

- DOM testing utilities (`queryBy`, `findBy`, `waitFor`)
- User interaction helpers (`click`, `type`, `fillForm`)
- Test router factory for component isolation
- Integration with `happy-dom` for JSDOM-like testing

---

## Architectural Concerns

### 1. Runtime ↔ Component Dependency Cycle (HIGH IMPACT)

**Issue:** `runtime/signal.ts` imports from `component/context.ts`:

```typescript
// runtime/signal.ts
import { type ContextScope, getContextScope, setContextScope } from '../component/context';
```

This creates a bidirectional dependency:
- `runtime/signal.ts` → `component/context.ts`
- `component/lifecycle.ts` → `runtime/signal.ts`
- `component/context.ts` is used by effects to restore context

**Why it matters:**
- Violates the "runtime is foundation" principle
- Makes it impossible to use signals independently of the component model
- Could cause issues with tree-shaking or circular import resolution at scale

**Recommendation:** 
Move context scope management into the runtime layer:
```
src/runtime/
├── signal.ts         # Remove context dependency
├── context-scope.ts  # NEW: Context scope primitives (currently in component/context.ts)
└── ...
```

Then have `component/context.ts` import from `runtime/context-scope.ts`. This keeps context as a runtime concept while `Context<T>` with its `Provider` API remains in the component module.

### 2. CSS Token Tables in Internals (MEDIUM IMPACT)

**Issue:** Token tables are exported from `internals` for compiler use:

```typescript
// internals.ts
export {
  SPACING_SCALE, FONT_SIZE_SCALE, PROPERTY_MAP, ...
} from './css/token-tables';
```

While this is intentional (compiler needs access), it exposes implementation details that could change.

**Recommendation:**
- Consider a `@vertz/ui/tokens` subpath for stable token access
- Document token stability guarantees in `token-tables.ts` header

### 3. JSX Runtime Duplication (MEDIUM IMPACT)

**Issue:** Two JSX runtime files exist:
- `src/jsx-runtime.ts` (root level, 80 lines)
- `src/jsx-runtime/index.ts` (subfolder, 150 lines with full JSX namespace)

The root `jsx-runtime.ts` appears to be a simpler version while `jsx-runtime/index.ts` has the full TypeScript types.

**Recommendation:**
- Consolidate into a single source of truth
- If both are needed, document why and their different purposes

### 4. Limited Extensibility for Custom Primitives (MEDIUM IMPACT)

**Issue:** The signal types are interfaces, not classes, which is good for extensibility. However:

- No `WritableSignal<T>` type to distinguish read-write from read-only
- No way to create custom reactive containers without copying implementation
- Effect disposal is internal (`_dispose()` on `EffectImpl`)

**Recommendation:**
```typescript
// Add to signal-types.ts
export interface WritableSignal<T> extends Signal<T> {
  /** Update the value with a transformer function */
  update(fn: (prev: T) => T): void;
}

// Export factory for custom reactive containers
export interface SignalOptions<T> {
  /** Custom equality check */
  equals?: (a: T, b: T) => boolean;
}
```

### 5. Form Module Coupling to SDK Pattern (LOW IMPACT)

**Issue:** `form/form.ts` is tightly coupled to the `SdkMethod<TBody, TResult>` interface:

```typescript
export interface SdkMethod<TBody, TResult> {
  (body: TBody): Promise<TResult>;
  url: string;
  method: string;
  meta?: { bodySchema?: FormSchema<TBody> };
}
```

This assumes a specific generated SDK pattern. While this works with `@vertz/codegen`, it limits form usage to that ecosystem.

**Recommendation:**
- Add a lower-level `form()` overload that accepts any `(data) => Promise<T>` function
- Document the SDK pattern as the recommended approach but not the only one

### 6. Query Cache Key Derivation Opacity (LOW IMPACT)

**Issue:** The `query/query.ts` derives cache keys from thunk source code:

```typescript
export function deriveKey(thunk: () => Promise<unknown>): string {
  const fnStr = thunk.toString();
  return hashString(fnStr);
}
```

This can produce unexpected cache collisions if two different thunks stringify to the same string.

**Recommendation:**
- Document the cache key derivation strategy clearly
- Consider adding a `key` option override at the top level (already exists but under-documented)

---

## Refactoring Recommendations

### Priority: HIGH

1. **Break the runtime ↔ component cycle**
   - Move `ContextScope` and scope management to `runtime/context-scope.ts`
   - Keep `Context<T>.Provider` API in `component/context.ts`
   - Timeline: 1-2 days
   - Files: `src/runtime/signal.ts`, `src/component/context.ts`

### Priority: MEDIUM

2. **Consolidate JSX runtime files**
   - Determine if `jsx-runtime.ts` at root is still needed
   - Remove duplication if unnecessary
   - Timeline: 0.5 days
   - Files: `src/jsx-runtime.ts`, `src/jsx-runtime/index.ts`

3. **Add extensibility types for signals**
   - `WritableSignal<T>` type
   - `SignalOptions<T>` for custom equality
   - Timeline: 0.5 days
   - Files: `src/runtime/signal-types.ts`

4. **Document token stability guarantees**
   - Add header comment to `token-tables.ts`
   - Consider `@vertz/ui/tokens` subpath for public token access
   - Timeline: 0.5 days

### Priority: LOW

5. **Form module decoupling**
   - Add `formFromHandler()` for generic async handlers
   - Keep `SdkMethod` pattern as primary API
   - Timeline: 1 day
   - Files: `src/form/form.ts`

6. **Query cache key documentation**
   - Document key derivation in JSDoc
   - Add examples for manual key override
   - Timeline: 0.25 days

---

## Dependency Analysis

### Import Graph Summary

```
runtime/      ← (imported by everything, imports nothing from vertz)
component/    ← imports runtime
dom/          ← imports runtime
css/          ← (standalone, only internal imports)
form/         ← imports runtime
router/       ← imports runtime, component (context)
query/        ← imports runtime
store/        ← imports runtime
hydrate/      ← imports component, css, query
test/         ← imports router
```

**Circular Dependencies Detected:** None (madge confirms)
**Bidirectional Dependencies:** runtime ↔ component (via context scope)

### External Dependencies

```json
{
  "devDependencies": {
    "@vertz/schema": "workspace:*",
    "@vitest/coverage-v8": "^4.0.18",
    "bunup": "latest",
    "happy-dom": "^18.0.1",
    "typescript": "^5.7.0",
    "vitest": "^4.0.18"
  }
}
```

- Minimal external dependencies (good)
- `@vertz/schema` is the only workspace dependency
- No runtime dependencies beyond what's in `src/`

---

## Extensibility Assessment

### What's Extensible

| Feature | Mechanism | Verdict |
|---------|-----------|---------|
| Custom components | Function returning `Node` | ✅ Excellent |
| CSS variants | `variants()` function with full type inference | ✅ Excellent |
| Form schemas | `FormSchema<T>` interface | ✅ Good |
| Routes | `RouteDefinitionMap` with nested support | ✅ Good |
| Signals | `Signal<T>`, `Computed<T>` interfaces | ⚠️ Good (see concern #4) |

### What's Not Extensible

| Feature | Limitation |
|---------|------------|
| Effect disposal | Internal `_dispose()` method |
| Custom reactive containers | No factory pattern exported |
| Token scale customization | Hardcoded in `token-tables.ts` |

---

## Conclusion

`@vertz/ui` is a well-designed reactive UI framework with clear architectural boundaries. The signal-based reactivity is cleanly implemented, and the separation of public/ internal APIs is exemplary. 

The primary architectural concern is the bidirectional dependency between `runtime` and `component` modules via context scope management. Resolving this would solidify the runtime as a true foundation layer.

Secondary improvements around extensibility types and documentation would enhance the developer experience for advanced use cases.

**Overall Grade: B+** (would be A- after resolving the runtime-component cycle)
