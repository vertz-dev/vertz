# Browser Platform APIs -- Design Doc

> Replace JavaScript polyfills with native browser APIs across the CSS compiler, router, headless primitives, and SSR pipeline.

**PRD:** `plans/prds/browser-platform-apis.md` (approved, backstage PR #14)
**Author:** mike (vertz-tech-lead)
**Status:** Draft -- awaiting review from josh, pm, nora

---

## 1. API Surface

### 1.1 CSS Compiler: `@layer`, Native Nesting, Container Queries

#### Layer Order Declaration

The compiler emits a single layer order declaration at the top of the extracted CSS bundle. All framework and user CSS is wrapped in the `vertz` parent layer to avoid namespace collisions with third-party layer systems (Tailwind, Open Props, etc.).

```css
/* Emitted once at the top of the CSS bundle */
@layer vertz {
  @layer reset, base, primitives, components, user;
}
```

**Layer assignment rules:**

| Source | Layer |
|--------|-------|
| `globalCss()` with reset selectors (`*`, `body`, `:root`) | `vertz.reset` |
| `globalCss()` with non-reset selectors | `vertz.base` |
| Primitives package internal styles (if any) | `vertz.primitives` |
| `variants()` calls (Volta components) | `vertz.components` |
| `css()` calls in application code | `vertz.user` |

The layer assignment is determined at compile time by the CSSExtractor based on the source file path and the API function called. No runtime layer detection.

**New types in `@vertz/ui-compiler`:**

```typescript
// packages/ui-compiler/src/css-extraction/layers.ts

/** CSS layer names used by the vertz framework. */
export type CSSLayer = 'reset' | 'base' | 'primitives' | 'components' | 'user';

/** Configuration for layer assignment. */
export interface LayerConfig {
  /** The parent layer name. Default: 'vertz'. */
  parentLayer: string;
  /** Layer order within the parent. */
  layerOrder: readonly CSSLayer[];
}

export const DEFAULT_LAYER_CONFIG: LayerConfig = {
  parentLayer: 'vertz',
  layerOrder: ['reset', 'base', 'primitives', 'components', 'user'] as const,
};

/**
 * Determine which layer a CSS block belongs to.
 *
 * @param sourcePath - The file path where the css()/globalCss()/variants() call lives.
 * @param apiFunction - Which API produced this CSS: 'css' | 'globalCss' | 'variants'.
 * @param isReset - For globalCss(), whether the selector targets reset elements.
 * @returns The layer name.
 */
export function resolveLayer(
  sourcePath: string,
  apiFunction: 'css' | 'globalCss' | 'variants',
  isReset?: boolean,
): CSSLayer {
  if (apiFunction === 'globalCss') {
    return isReset ? 'reset' : 'base';
  }
  if (apiFunction === 'variants') {
    return 'components';
  }
  if (sourcePath.includes('/primitives/')) {
    return 'primitives';
  }
  return 'user';
}

/**
 * Generate the layer order declaration CSS.
 */
export function generateLayerOrder(config: LayerConfig = DEFAULT_LAYER_CONFIG): string {
  const layers = config.layerOrder.join(', ');
  return `@layer ${config.parentLayer} {\n  @layer ${layers};\n}`;
}

/**
 * Wrap a CSS string in a layer block.
 */
export function wrapInLayer(css: string, layer: CSSLayer, parentLayer: string = 'vertz'): string {
  return `@layer ${parentLayer}.${layer} {\n${css}\n}`;
}
```

**Reset selector detection:**

```typescript
// packages/ui-compiler/src/css-extraction/layers.ts

/** Selectors that indicate a CSS reset. */
const RESET_SELECTORS = new Set([
  '*',
  '*, *::before, *::after',
  '*::before',
  '*::after',
  ':root',
  'html',
  'body',
]);

/**
 * Check if a globalCss() selector is a reset selector.
 */
export function isResetSelector(selector: string): boolean {
  return RESET_SELECTORS.has(selector.trim());
}
```

#### Native CSS Nesting

The CSSExtractor and CSSTransformer currently emit flattened rules with resolved selectors (e.g., `.className:hover { ... }` as a separate rule). With native nesting, pseudo-selectors and nested object-form selectors are emitted inside the parent rule using `&` syntax.

**Before (current output):**

```css
._a1b2c3d4 {
  padding: 1rem;
  background-color: var(--color-background);
}
._a1b2c3d4:hover {
  background-color: var(--color-primary-700);
}
._a1b2c3d4::after {
  content: '';
  display: block;
}
```

**After (native nesting output):**

```css
._a1b2c3d4 {
  padding: 1rem;
  background-color: var(--color-background);

  &:hover {
    background-color: var(--color-primary-700);
  }

  &::after {
    content: '';
    display: block;
  }
}
```

The `css()` runtime API is unchanged. The `StyleEntry` type is unchanged. The nesting is purely an output format change in the extraction pipeline.

**Modified function signature in CSSExtractor:**

```typescript
// packages/ui-compiler/src/css-extraction/extractor.ts

export interface CSSExtractionOptions {
  /** Enable native CSS nesting output. Default: true. */
  nesting: boolean;
  /** Layer configuration. Default: DEFAULT_LAYER_CONFIG. */
  layers: LayerConfig;
}

export interface CSSExtractionResult {
  /** The extracted CSS rules as a string. */
  css: string;
  /** The block names found in static css() calls. */
  blockNames: string[];
  /** The layer this CSS belongs to. */
  layer: CSSLayer;
}

export class CSSExtractor {
  private options: CSSExtractionOptions;

  constructor(options?: Partial<CSSExtractionOptions>) {
    this.options = {
      nesting: true,
      layers: DEFAULT_LAYER_CONFIG,
      ...options,
    };
  }

  extract(source: string, filePath: string): CSSExtractionResult {
    // ... existing AST walking ...
    // Changed: buildCSSRules now accepts nesting option
    // Changed: result includes layer assignment
  }
}
```

**New `buildNestedCSSRule` function:**

```typescript
// packages/ui-compiler/src/css-extraction/extractor.ts

/**
 * Build a single CSS rule with nested pseudo/selector rules.
 * Emits native CSS nesting syntax.
 */
function buildNestedCSSRule(
  className: string,
  baseDecls: string[],
  pseudoDecls: Map<string, string[]>,
  nestedRules: Array<{ selector: string; decls: string[] }>,
): string {
  const parts: string[] = [];

  // Base declarations
  parts.push(`.${className} {`);
  for (const decl of baseDecls) {
    parts.push(`  ${decl}`);
  }

  // Pseudo declarations as nested rules
  for (const [pseudo, decls] of pseudoDecls) {
    parts.push('');
    parts.push(`  &${pseudo} {`);
    for (const decl of decls) {
      parts.push(`    ${decl}`);
    }
    parts.push('  }');
  }

  // Object-form nested selectors
  for (const nested of nestedRules) {
    parts.push('');
    parts.push(`  ${nested.selector} {`);
    for (const decl of nested.decls) {
      parts.push(`    ${decl}`);
    }
    parts.push('  }');
  }

  parts.push('}');
  return parts.join('\n');
}
```

#### Container Queries in `css()`

Container queries extend the existing object-form nested selector pattern. Currently, `css()` supports:

```typescript
css({
  card: [
    'p:4', 'bg:background',
    { '&::after': ['content:empty', 'block'] },
  ],
});
```

Container queries follow the same pattern with `@container` as the key:

```typescript
css({
  card: [
    'p:4', 'bg:background',
    { '@container (min-width: 400px)': ['p:8', 'font:lg'] },
    { '@container sidebar (min-width: 300px)': ['p:6'] },
  ],
});
```

**No changes to `CSSInput`, `StyleEntry`, or `CSSOutput` types.** Container queries are already valid keys in the `Record<string, string[]>` object form. The change is in how the compiler/extractor handles keys that start with `@container`.

**Compiler output:**

```css
._a1b2c3d4 {
  padding: 1rem;
  background-color: var(--color-background);

  @container (min-width: 400px) {
    padding: 2rem;
    font-size: 1.125rem;
  }

  @container sidebar (min-width: 300px) {
    padding: 1.5rem;
  }
}
```

**Container type helper -- new shorthand in `css()`:**

Developers need to establish containment contexts. A new `container-type` shorthand is added to the property map:

```typescript
// Addition to PROPERTY_MAP in token-resolver.ts and css-transformer.ts

'container-type': { properties: ['container-type'], valueType: 'container-type' },
'container-name': { properties: ['container-name'], valueType: 'raw' },
```

```typescript
// New value type resolution
const CONTAINER_TYPE_MAP: Record<string, string> = {
  'inline-size': 'inline-size',
  'size': 'size',
  'normal': 'normal',
};
```

Usage:

```typescript
css({
  sidebar: ['container-type:inline-size', 'container-name:sidebar'],
  card: [
    'p:4',
    { '@container sidebar (min-width: 300px)': ['p:8'] },
  ],
});
```

**Compiler warning for orphaned container queries:**

```typescript
// packages/ui-compiler/src/diagnostics/css-diagnostics.ts

export interface ContainerQueryDiagnostic {
  kind: 'container-query-no-context';
  message: string;
  /** The container query key that has no matching container-type in scope. */
  query: string;
  /** Source file path. */
  filePath: string;
  /** Line number in source. */
  line: number;
}
```

The diagnostic is emitted when the compiler detects a `@container` key in a `css()` call but finds no `container-type` declaration in the same file or any imported module. This is a warning, not an error -- the containment context may be set by a parent component.

### 1.2 Router: Navigation API + View Transitions

#### Navigation API Integration

The router's `createRouter` function gains an internal `NavigationBackend` abstraction. The public `Router` interface is unchanged.

```typescript
// packages/ui/src/router/navigation-backend.ts

/**
 * Abstract navigation backend.
 * Isolates the router from the specific browser history/navigation API.
 */
export interface NavigationBackend {
  /** Push a new URL to the navigation stack. */
  push(url: string): void;
  /** Replace the current URL in the navigation stack. */
  replace(url: string): void;
  /** Listen for external navigation events (back/forward). */
  onNavigate(callback: (url: string) => void): () => void;
  /** Clean up listeners. */
  dispose(): void;
}

/**
 * Create a NavigationBackend using the Navigation API if available,
 * falling back to the History API.
 */
export function createNavigationBackend(): NavigationBackend {
  if (typeof window !== 'undefined' && 'navigation' in window) {
    return createNavigationAPIBackend();
  }
  return createHistoryAPIBackend();
}
```

**Navigation API backend:**

```typescript
// packages/ui/src/router/navigation-backend.ts

function createNavigationAPIBackend(): NavigationBackend {
  const nav = (window as Window & { navigation: Navigation }).navigation;
  let navigateHandler: ((event: NavigateEvent) => void) | null = null;

  return {
    push(url: string): void {
      nav.navigate(url, { history: 'push' });
    },

    replace(url: string): void {
      nav.navigate(url, { history: 'replace' });
    },

    onNavigate(callback: (url: string) => void): () => void {
      navigateHandler = (event: NavigateEvent) => {
        // Only handle same-origin, same-document traversals
        if (!event.canIntercept || event.hashChange) return;
        if (event.navigationType === 'traverse') {
          const url = new URL(event.destination.url);
          callback(url.pathname + url.search);
        }
      };
      nav.addEventListener('navigate', navigateHandler);
      return () => {
        if (navigateHandler) {
          nav.removeEventListener('navigate', navigateHandler);
          navigateHandler = null;
        }
      };
    },

    dispose(): void {
      if (navigateHandler) {
        nav.removeEventListener('navigate', navigateHandler);
        navigateHandler = null;
      }
    },
  };
}
```

**History API backend (current behavior, extracted):**

```typescript
// packages/ui/src/router/navigation-backend.ts

function createHistoryAPIBackend(): NavigationBackend {
  let popstateHandler: (() => void) | null = null;

  return {
    push(url: string): void {
      window.history.pushState(null, '', url);
    },

    replace(url: string): void {
      window.history.replaceState(null, '', url);
    },

    onNavigate(callback: (url: string) => void): () => void {
      popstateHandler = () => {
        const url = window.location.pathname + window.location.search;
        callback(url);
      };
      window.addEventListener('popstate', popstateHandler);
      return () => {
        if (popstateHandler) {
          window.removeEventListener('popstate', popstateHandler);
          popstateHandler = null;
        }
      };
    },

    dispose(): void {
      if (popstateHandler) {
        window.removeEventListener('popstate', popstateHandler);
        popstateHandler = null;
      }
    },
  };
}
```

**Modified `createRouter`:**

The only change to `navigate.ts` is that it uses the backend abstraction instead of direct `window.history` and `popstate` calls. The `Router` interface, `NavigateOptions` type, and all public signals remain identical.

```typescript
// packages/ui/src/router/navigate.ts (modified)

export function createRouter(routes: CompiledRoute[], initialUrl: string): Router {
  const backend = createNavigationBackend();

  // ... existing signal setup (current, loaderData, loaderError, searchParams) ...

  async function navigate(url: string, options?: NavigateOptions): Promise<void> {
    if (options?.replace) {
      backend.replace(url);
    } else {
      backend.push(url);
    }
    await applyNavigation(url);
  }

  // Listen for external navigation (back/forward)
  const removeNavigateListener = backend.onNavigate((url: string) => {
    applyNavigation(url).catch(() => {
      // Error stored in loaderError signal
    });
  });

  function dispose(): void {
    removeNavigateListener();
    backend.dispose();
    if (currentAbort) {
      currentAbort.abort();
    }
  }

  // ... rest unchanged ...
}
```

#### View Transitions Integration

View Transitions are opt-in. The `RouteConfig` type gains an optional `viewTransition` field, and `createRouter` accepts a `RouterOptions` that includes global view transition settings.

```typescript
// packages/ui/src/router/view-transitions.ts

/** View transition configuration for a route. */
export interface ViewTransitionConfig {
  /**
   * Enable view transitions for this route.
   * true = default cross-fade.
   * string = CSS class name applied to the transition.
   */
  enabled: boolean | string;
}

/** Options for createRouter. */
export interface RouterOptions {
  /**
   * Global view transition setting.
   * When true, all navigations use the default cross-fade.
   * When a ViewTransitionConfig, applies to all routes.
   * Individual route configs override this.
   * Default: false (no transitions).
   */
  viewTransition?: boolean | ViewTransitionConfig;
}

/**
 * Wrap a DOM update callback in a view transition if supported and enabled.
 *
 * @param update - The callback that performs the DOM mutation.
 * @param config - View transition config (from route or global).
 * @returns Promise that resolves when the update (and optional transition) completes.
 */
export async function withViewTransition(
  update: () => void | Promise<void>,
  config: ViewTransitionConfig | boolean | undefined,
): Promise<void> {
  const enabled = typeof config === 'boolean' ? config : config?.enabled ?? false;

  if (!enabled) {
    await update();
    return;
  }

  // Respect reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await update();
    return;
  }

  // Check for View Transitions API support
  if (!('startViewTransition' in document)) {
    await update();
    return;
  }

  const transitionClass = typeof config === 'object' && typeof config.enabled === 'string'
    ? config.enabled
    : undefined;

  if (transitionClass) {
    document.documentElement.classList.add(transitionClass);
  }

  const transition = document.startViewTransition(async () => {
    await update();
  });

  try {
    await transition.finished;
  } finally {
    if (transitionClass) {
      document.documentElement.classList.remove(transitionClass);
    }
  }
}
```

**Extended `RouteConfig`:**

```typescript
// packages/ui/src/router/define-routes.ts (additions)

export interface RouteConfig<
  TPath extends string = string,
  TLoaderData = unknown,
  TSearch = unknown,
> {
  // ... existing fields ...

  /** View transition configuration for this route. */
  viewTransition?: boolean | ViewTransitionConfig;
}
```

**Extended `createRouter`:**

```typescript
// packages/ui/src/router/navigate.ts (additions)

export function createRouter(
  routes: CompiledRoute[],
  initialUrl: string,
  options?: RouterOptions,
): Router {
  // ... existing setup ...

  async function applyNavigation(url: string): Promise<void> {
    if (currentAbort) {
      currentAbort.abort();
    }

    const gen = ++navigationGen;
    const abort = new AbortController();
    currentAbort = abort;

    const match = matchRoute(routes, url);

    // Determine view transition config: route-level overrides global
    const transitionConfig = match?.route.viewTransition ?? options?.viewTransition;

    await withViewTransition(async () => {
      current.value = match;
      if (match) {
        searchParams.value = match.search;
        await runLoaders(match, gen, abort.signal);
      } else {
        searchParams.value = {};
        if (gen === navigationGen) {
          loaderData.value = [];
          loaderError.value = null;
        }
      }
    }, transitionConfig);
  }

  // ... rest unchanged ...
}
```

**`viewTransitionName` in `css()`:**

Developers can assign view transition names via the existing object-form in `css()`:

```typescript
css({
  hero: [
    'w:full', 'h:64',
    { '&': ['view-transition-name: hero-image'] },
  ],
});
```

This already works with the current object-form selector mechanism -- `view-transition-name` is a standard CSS property that the nested selector passthrough handles. No new API surface is needed. We add a `view-transition-name` shorthand for convenience:

```typescript
// Addition to PROPERTY_MAP
'vt-name': { properties: ['view-transition-name'], valueType: 'raw' },
```

Usage: `css({ hero: ['w:full', 'vt-name:hero-image'] })`.

### 1.3 Primitives: Popover API + CSS Anchor Positioning

#### Popover API Migration

Each overlay primitive (`Popover`, `Select`, `Combobox`, `Menu`, `Tooltip`, `Dialog`) is migrated to use the HTML `popover` attribute and related APIs. The public API of each primitive is unchanged -- the migration is internal.

**New utility functions:**

```typescript
// packages/primitives/src/utils/popover.ts

/**
 * Check if the Popover API is supported in the current browser.
 */
export function supportsPopoverAPI(): boolean {
  return typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype;
}

/**
 * Check if CSS Anchor Positioning is supported.
 */
export function supportsAnchorPositioning(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('anchor-name', '--a');
}

/** Popover type: 'auto' for light-dismiss, 'manual' for explicit control only. */
export type PopoverType = 'auto' | 'manual';

/**
 * Configure an element as a popover.
 *
 * @param element - The element to make a popover.
 * @param type - Popover type: 'auto' (light-dismiss) or 'manual'.
 */
export function configurePopover(element: HTMLElement, type: PopoverType = 'auto'): void {
  element.setAttribute('popover', type);
}

/**
 * Configure a trigger element to control a popover.
 *
 * @param trigger - The trigger element.
 * @param targetId - The ID of the popover element.
 */
export function configurePopoverTrigger(trigger: HTMLElement, targetId: string): void {
  trigger.setAttribute('popovertarget', targetId);
}

/**
 * Show a popover element.
 */
export function showPopover(element: HTMLElement): void {
  if ('showPopover' in element) {
    (element as HTMLElement & { showPopover(): void }).showPopover();
  }
}

/**
 * Hide a popover element.
 */
export function hidePopover(element: HTMLElement): void {
  if ('hidePopover' in element) {
    (element as HTMLElement & { hidePopover(): void }).hidePopover();
  }
}
```

**Anchor positioning utilities:**

```typescript
// packages/primitives/src/utils/anchor.ts

/**
 * CSS Anchor Positioning placement values.
 * Maps developer-facing placement names to CSS anchor positioning values.
 */
export type AnchorPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end'
  | 'left-start'
  | 'left-end'
  | 'right-start'
  | 'right-end';

/** Map placement to CSS position-area values. */
const PLACEMENT_TO_POSITION_AREA: Record<AnchorPlacement, string> = {
  'top': 'block-start',
  'bottom': 'block-end',
  'left': 'inline-start',
  'right': 'inline-end',
  'top-start': 'block-start inline-start',
  'top-end': 'block-start inline-end',
  'bottom-start': 'block-end inline-start',
  'bottom-end': 'block-end inline-end',
  'left-start': 'inline-start block-start',
  'left-end': 'inline-start block-end',
  'right-start': 'inline-end block-start',
  'right-end': 'inline-end block-end',
};

/**
 * Apply CSS Anchor Positioning styles to link a popover to its trigger.
 *
 * @param trigger - The anchor element (trigger).
 * @param content - The positioned element (popover content).
 * @param anchorName - Unique anchor name (CSS dashed-ident).
 * @param placement - Placement relative to the anchor.
 */
export function applyAnchorPositioning(
  trigger: HTMLElement,
  content: HTMLElement,
  anchorName: string,
  placement: AnchorPlacement = 'bottom',
): void {
  const dashedIdent = `--${anchorName}`;
  trigger.style.anchorName = dashedIdent;
  content.style.positionAnchor = dashedIdent;
  content.style.position = 'fixed';

  const positionArea = PLACEMENT_TO_POSITION_AREA[placement];
  if (positionArea) {
    // Use position-area (the current spec name, replacing inset-area)
    content.style.setProperty('position-area', positionArea);
  }
}
```

**Fallback positioning module:**

```typescript
// packages/primitives/src/utils/fallback-positioning.ts

/**
 * Lightweight JS fallback for positioning when CSS Anchor Positioning
 * is not supported. Loaded conditionally via dynamic import.
 *
 * This is NOT a full Floating UI replacement. It handles the basic
 * placement cases (top, bottom, left, right + alignment variants)
 * and viewport boundary detection.
 */

import type { AnchorPlacement } from './anchor';

export interface FallbackPositionResult {
  top: number;
  left: number;
}

/**
 * Calculate fallback position for a popover relative to its trigger.
 */
export function calculateFallbackPosition(
  trigger: HTMLElement,
  content: HTMLElement,
  placement: AnchorPlacement = 'bottom',
): FallbackPositionResult {
  const triggerRect = trigger.getBoundingClientRect();
  const contentRect = content.getBoundingClientRect();

  let top: number;
  let left: number;

  switch (placement) {
    case 'top':
    case 'top-start':
    case 'top-end':
      top = triggerRect.top - contentRect.height;
      break;
    case 'bottom':
    case 'bottom-start':
    case 'bottom-end':
      top = triggerRect.bottom;
      break;
    case 'left':
    case 'left-start':
    case 'left-end':
      top = triggerRect.top;
      break;
    case 'right':
    case 'right-start':
    case 'right-end':
      top = triggerRect.top;
      break;
    default:
      top = triggerRect.bottom;
  }

  switch (placement) {
    case 'top':
    case 'bottom':
      left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
      break;
    case 'top-start':
    case 'bottom-start':
      left = triggerRect.left;
      break;
    case 'top-end':
    case 'bottom-end':
      left = triggerRect.right - contentRect.width;
      break;
    case 'left':
    case 'left-start':
    case 'left-end':
      left = triggerRect.left - contentRect.width;
      break;
    case 'right':
    case 'right-start':
    case 'right-end':
      left = triggerRect.right;
      break;
    default:
      left = triggerRect.left;
  }

  // Viewport boundary clamping
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left < 0) left = 0;
  if (left + contentRect.width > vw) left = vw - contentRect.width;
  if (top < 0) top = 0;
  if (top + contentRect.height > vh) top = vh - contentRect.height;

  return { top, left };
}

/**
 * Apply fallback positioning to an element.
 */
export function applyFallbackPosition(
  content: HTMLElement,
  position: FallbackPositionResult,
): void {
  content.style.position = 'fixed';
  content.style.top = `${position.top}px`;
  content.style.left = `${position.left}px`;
}
```

**Migrated Popover primitive (example -- all six follow this pattern):**

```typescript
// packages/primitives/src/popover/popover.ts (rewritten)

import type { Signal } from '@vertz/ui';
import { signal } from '@vertz/ui';
import type { AnchorPlacement } from '../utils/anchor';
import { applyAnchorPositioning } from '../utils/anchor';
import { setDataState, setExpanded } from '../utils/aria';
import { focusFirst, saveFocus } from '../utils/focus';
import { linkedIds } from '../utils/id';
import {
  configurePopover,
  configurePopoverTrigger,
  hidePopover,
  showPopover,
  supportsAnchorPositioning,
  supportsPopoverAPI,
} from '../utils/popover';

export interface PopoverOptions {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Placement relative to the trigger. Default: 'bottom'. */
  placement?: AnchorPlacement;
}

export interface PopoverState {
  open: Signal<boolean>;
}

export interface PopoverElements {
  trigger: HTMLButtonElement;
  content: HTMLDivElement;
}

export const Popover = {
  Root(options: PopoverOptions = {}): PopoverElements & { state: PopoverState } {
    const { defaultOpen = false, onOpenChange, placement = 'bottom' } = options;
    const ids = linkedIds('popover');
    const state: PopoverState = { open: signal(defaultOpen) };
    let restoreFocus: (() => void) | null = null;

    const trigger = document.createElement('button');
    trigger.setAttribute('type', 'button');
    trigger.id = ids.triggerId;
    trigger.setAttribute('aria-controls', ids.contentId);
    trigger.setAttribute('aria-haspopup', 'dialog');
    setExpanded(trigger, defaultOpen);
    setDataState(trigger, defaultOpen ? 'open' : 'closed');

    const content = document.createElement('div');
    content.setAttribute('role', 'dialog');
    content.id = ids.contentId;
    setDataState(content, defaultOpen ? 'open' : 'closed');

    const useNativePopover = supportsPopoverAPI();
    const useNativeAnchoring = supportsAnchorPositioning();

    if (useNativePopover) {
      // Native Popover API: top-layer rendering, native dismiss
      configurePopover(content, 'auto');
      configurePopoverTrigger(trigger, content.id);

      if (useNativeAnchoring) {
        applyAnchorPositioning(trigger, content, ids.contentId, placement);
      }
    }

    function open(): void {
      state.open.value = true;
      setExpanded(trigger, true);
      setDataState(trigger, 'open');
      setDataState(content, 'open');
      restoreFocus = saveFocus();

      if (useNativePopover) {
        showPopover(content);
      } else {
        content.hidden = false;
      }

      if (!useNativeAnchoring) {
        // Load fallback positioning dynamically
        void import('../utils/fallback-positioning').then(
          ({ calculateFallbackPosition, applyFallbackPosition }) => {
            const pos = calculateFallbackPosition(trigger, content, placement);
            applyFallbackPosition(content, pos);
          },
        );
      }

      queueMicrotask(() => focusFirst(content));
      onOpenChange?.(true);
    }

    function close(): void {
      state.open.value = false;
      setExpanded(trigger, false);
      setDataState(trigger, 'closed');
      setDataState(content, 'closed');

      if (useNativePopover) {
        hidePopover(content);
      } else {
        content.hidden = true;
      }

      restoreFocus?.();
      restoreFocus = null;
      onOpenChange?.(false);
    }

    // With native popover, the browser handles toggle events
    if (useNativePopover) {
      content.addEventListener('toggle', (event) => {
        const toggleEvent = event as ToggleEvent;
        if (toggleEvent.newState === 'open') {
          state.open.value = true;
          setExpanded(trigger, true);
          setDataState(trigger, 'open');
          setDataState(content, 'open');
          restoreFocus = saveFocus();
          queueMicrotask(() => focusFirst(content));
          onOpenChange?.(true);
        } else {
          state.open.value = false;
          setExpanded(trigger, false);
          setDataState(trigger, 'closed');
          setDataState(content, 'closed');
          restoreFocus?.();
          restoreFocus = null;
          onOpenChange?.(false);
        }
      });
    } else {
      // Fallback: manual click toggle + Escape handler
      trigger.addEventListener('click', () => {
        if (state.open.peek()) {
          close();
        } else {
          open();
        }
      });

      content.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      });
    }

    if (defaultOpen) {
      queueMicrotask(() => open());
    } else if (!useNativePopover) {
      content.hidden = true;
    }

    return { trigger, content, state };
  },
};
```

**Dialog migration specifics:**

Dialog is special: modal dialogs use the native `<dialog>` element with `showModal()`, while non-modal dialogs use the Popover API.

```typescript
// packages/primitives/src/dialog/dialog.ts (key changes)

export const Dialog = {
  Root(options: DialogOptions = {}): DialogElements & { state: DialogState } {
    const { modal = true, defaultOpen = false, onOpenChange } = options;

    if (modal) {
      // Modal: use native <dialog> element
      const dialogEl = document.createElement('dialog') as HTMLDialogElement;
      // ... showModal() / close() ...
      // Backdrop stylable via ::backdrop
    } else {
      // Non-modal: use Popover API (same pattern as Popover primitive)
      const content = document.createElement('div');
      configurePopover(content, 'manual'); // manual = no light-dismiss for non-modal
      // ... showPopover() / hidePopover() ...
    }
  },
};
```

### 1.4 SSR: Brotli Compression

#### Brotli Streaming Compression

A new compression layer wraps the `renderToStream` output.

```typescript
// packages/ui-server/src/compression.ts

/** Supported compression encodings. */
export type CompressionEncoding = 'br' | 'gzip' | 'identity';

/** Options for SSR streaming compression. */
export interface CompressionOptions {
  /**
   * Brotli quality level for streaming (0-11).
   * Lower = faster, higher = better compression.
   * Default: 4 (good balance for streaming).
   */
  brotliQuality?: number;
  /**
   * Minimum chunk size in bytes before applying compression.
   * Chunks smaller than this are buffered or sent uncompressed.
   * Default: 1024 (1 KB).
   */
  minChunkSize?: number;
}

/**
 * Detect the best compression encoding from an Accept-Encoding header.
 */
export function negotiateEncoding(acceptEncoding: string | null): CompressionEncoding {
  if (!acceptEncoding) return 'identity';
  if (acceptEncoding.includes('br')) return 'br';
  if (acceptEncoding.includes('gzip')) return 'gzip';
  return 'identity';
}

/**
 * Wrap a ReadableStream with compression.
 *
 * @param stream - The original HTML stream from renderToStream.
 * @param encoding - The negotiated encoding.
 * @param options - Compression options.
 * @returns A compressed ReadableStream and the Content-Encoding header value.
 */
export function compressStream(
  stream: ReadableStream<Uint8Array>,
  encoding: CompressionEncoding,
  options?: CompressionOptions,
): { stream: ReadableStream<Uint8Array>; contentEncoding: string } {
  if (encoding === 'identity') {
    return { stream, contentEncoding: 'identity' };
  }

  const minChunkSize = options?.minChunkSize ?? 1024;

  if (encoding === 'br') {
    // Use the Web Streams CompressionStream API if available,
    // otherwise fall back to Node.js zlib.
    if (typeof CompressionStream !== 'undefined') {
      const compressed = stream
        .pipeThrough(new ChunkBufferTransform(minChunkSize))
        .pipeThrough(new CompressionStream('deflate'));
      // Note: CompressionStream does not support Brotli in all runtimes.
      // For Brotli, we use the Node.js zlib API.
      return { stream: createBrotliStream(stream, options), contentEncoding: 'br' };
    }
    return { stream: createBrotliStream(stream, options), contentEncoding: 'br' };
  }

  if (encoding === 'gzip') {
    if (typeof CompressionStream !== 'undefined') {
      const compressed = stream
        .pipeThrough(new ChunkBufferTransform(minChunkSize))
        .pipeThrough(new CompressionStream('gzip'));
      return { stream: compressed, contentEncoding: 'gzip' };
    }
    return { stream: createGzipStream(stream), contentEncoding: 'gzip' };
  }

  return { stream, contentEncoding: 'identity' };
}

/**
 * Create a Brotli compression stream using Node.js zlib.
 */
function createBrotliStream(
  input: ReadableStream<Uint8Array>,
  options?: CompressionOptions,
): ReadableStream<Uint8Array> {
  // Implementation uses zlib.createBrotliCompress with:
  // - quality = options?.brotliQuality ?? 4
  // - minimum chunk buffering per options?.minChunkSize ?? 1024
  // Details in implementation phase.
  throw new Error('Implementation in Sub-phase 3');
}

/**
 * Create a gzip compression stream using Node.js zlib.
 */
function createGzipStream(
  input: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  throw new Error('Implementation in Sub-phase 3');
}
```

**`ChunkBufferTransform` -- buffers small chunks:**

```typescript
// packages/ui-server/src/compression.ts

/**
 * TransformStream that buffers chunks smaller than minSize.
 * Flushes the buffer when accumulated size exceeds minSize or on stream end.
 */
class ChunkBufferTransform implements TransformStream<Uint8Array, Uint8Array> {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;

  constructor(minSize: number) {
    let buffer: Uint8Array[] = [];
    let bufferSize = 0;

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer.push(chunk);
        bufferSize += chunk.length;
        if (bufferSize >= minSize) {
          const merged = mergeChunks(buffer, bufferSize);
          controller.enqueue(merged);
          buffer = [];
          bufferSize = 0;
        }
      },
      flush(controller) {
        if (buffer.length > 0) {
          const merged = mergeChunks(buffer, bufferSize);
          controller.enqueue(merged);
        }
      },
    });

    this.readable = readable;
    this.writable = writable;
  }
}

function mergeChunks(chunks: Uint8Array[], totalSize: number): Uint8Array {
  if (chunks.length === 1) return chunks[0]!;
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
```

**Static asset pre-compression (build-time):**

```typescript
// packages/ui-compiler/src/build/brotli-precompress.ts

/**
 * Pre-compress static assets (CSS, JS) with Brotli at quality 11
 * during the build step. Produces .br files alongside originals.
 */
export interface PrecompressOptions {
  /** File extensions to compress. Default: ['.css', '.js', '.html', '.svg']. */
  extensions?: string[];
  /** Brotli quality for static assets. Default: 11. */
  quality?: number;
}

export async function precompressAssets(
  outputDir: string,
  options?: PrecompressOptions,
): Promise<{ compressed: number; totalSaved: number }>;
```

**New exports from `@vertz/ui-server`:**

```typescript
// packages/ui-server/src/index.ts (additions)

export type { CompressionEncoding, CompressionOptions } from './compression';
export { compressStream, negotiateEncoding } from './compression';
```

---

## 2. Manifesto Alignment

| Design Decision | Manifesto Principle | Alignment |
|---|---|---|
| Popover API replaces JS positioning | **"Compile-time over runtime"** | Less runtime JS, more browser-native behavior. The compiler decides the rendering strategy. |
| Navigation API is transparent | **"One Way to Do Things"** | `router.navigate()` is the only way. The backend selection is invisible. No new API to learn. |
| `@layer` wrapping is automatic | **"Convention over configuration"** | Developers get correct cascade ordering without configuring layers. Zero-config. |
| Native CSS nesting is output-only | **"Explicit over implicit"** | The developer's `css()` input is unchanged. The output format change is visible only if inspected. |
| Container queries use existing `css()` pattern | **"One Way to Do Things"** | `@container` queries use the same object-form nesting as `&::after`. One pattern for all nested CSS. |
| View Transitions are opt-in | **"Predictability over convenience"** | Transitions require explicit `viewTransition: true`. No surprises on existing routes. |
| Brotli compression is invisible | **"Production-ready by default"** | Faster SSR out of the box. No configuration needed. |

**Tradeoffs accepted:**

- **Native over portable.** CSS Anchor Positioning requires a JS fallback for ~23% of browsers. We accept the dual-path complexity because the native path is zero-JS, and the fallback is code-split (loaded only when needed). This is the same progressive enhancement model the MANIFESTO endorses: "Don't fight the browser."
- **Opt-in over opt-out for View Transitions.** Astro and SvelteKit both proved that opt-in is correct for v1. Transitions require intentional design. Opt-out would create unexpected motion on untested routes. Predictability wins.
- **`@layer` is opinionated.** Developers cannot reorder vertz's internal layers. This is a convention-over-configuration tradeoff. If a developer needs to override the layer order, they control the top-level declaration: `@layer vertz, tailwindcss;`.

**Where this makes the LLM's job easier:**

- The `css()` API is unchanged. An LLM trained on vertz `css()` calls generates correct code without knowing about `@layer` or native nesting -- the compiler handles it.
- The `Router` interface is unchanged. An LLM generates `router.navigate('/path')` and it works identically on both Navigation API and History API backends.
- Popover primitives keep the same `Popover.Root({ placement: 'bottom' })` interface. The LLM does not need to know about Popover API vs. fallback.

---

## 3. Non-Goals

From the PRD, plus technical non-goals:

| Non-Goal | Rationale |
|----------|-----------|
| **CSS `@scope` rule** | No Firefox/Safari support as of early 2026. Existing class name hashing handles scoping. |
| **Declarative Shadow DOM** | Vertz does not use Shadow DOM. Scoping via compiler-generated hashes. |
| **Web Components output target** | Separate initiative. Not related to platform API adoption. |
| **CloseWatcher API standalone** | Popover API handles dismiss for overlays. |
| **Speculation Rules API** | Performance optimization, separate from platform API adoption. |
| **Cross-document View Transitions** | Limited browser support (no Firefox). Same-document only. |
| **Navigation API `intercept()` in public API** | Deferred until browser support broadens and usage patterns stabilize. Internal use only for now. |
| **Custom layer ordering API** | Developers control top-level ordering via standard CSS `@layer` declarations. No framework API needed. |
| **CSS Anchor Positioning polyfill** | The fallback is a lightweight JS positioning module, not a full polyfill of the CSS Anchor Positioning specification. |
| **`beforeNavigate` hook** | PRD defers this. Navigation interception is internal-only in this phase. |
| **Brotli configuration API** | Quality level and chunk thresholds are sensible defaults. No per-request configuration knob. |

---

## 4. Unknowns

### 4.1 View Transitions + Signal Reactivity (Needs POC -- BLOCKS Sub-phase 2)

**Question:** When the router triggers navigation and wraps the DOM update in `document.startViewTransition()`, does the signal-based DOM update complete within the view transition's update callback?

**Why this matters:** `startViewTransition(callback)` expects the callback to perform the DOM mutation synchronously (or as a microtask-resolved promise). Vertz's signal propagation uses `queueMicrotask` in the scheduler (`runtime/scheduler.ts`). If signal updates schedule microtasks that resolve after the view transition captures its "new" snapshot, the transition will show stale DOM.

**Resolution strategy:** Needs POC.

**POC scope:**
1. Create a minimal two-route vertz app
2. Wrap `applyNavigation()` in `document.startViewTransition(async () => { ... })`
3. Verify that after `await applyNavigation(url)`, all signal-driven DOM updates have flushed
4. Capture screenshots of the view transition's "old" and "new" states to confirm correctness
5. Duration: 1-2 days

**Possible outcomes:**
- **Signal updates complete within the callback:** No changes needed. Proceed with the design as written.
- **Signal updates are deferred past the callback:** Need to introduce a `flush()` mechanism in the scheduler that synchronously processes all pending signal updates. This would be called inside the view transition callback: `startViewTransition(() => { applyNavigation(url); flushSignals(); })`.

### 4.2 Popover API Nested Popovers (Discussion-resolvable)

**Question:** When a popover contains a trigger for another popover (e.g., a menu item that opens a submenu), does the native Popover API's light-dismiss behavior close the parent popover when the child opens?

**Expected answer:** The Popover API specification handles nested popovers. An `auto` popover that is the invoker's ancestor in the popover stack is not dismissed when the child opens. However, this only works if the nesting relationship is established correctly (child popover is shown while parent is in the top layer).

**Resolution:** Verify in the integration tests during Sub-phase 3. If nested popover behavior is incorrect, fall back to `manual` type for parent popovers that contain nested triggers and manage dismiss explicitly.

### 4.3 `@layer` Order with SSR (Discussion-resolvable)

**Question:** When CSS is inlined during SSR (critical CSS extraction), and additional CSS loads after hydration, does the `@layer` order declaration need to appear in both the inline `<style>` and the linked `<link>` stylesheet?

**Expected answer:** No. The `@layer` order declaration should appear exactly once, in the first `<style>` block in the HTML `<head>`. Subsequent CSS files that reference `@layer vertz.user { ... }` will follow the order established by the first declaration. The `@layer` order is determined by the first occurrence in the cascade.

**Resolution:** The `inlineCriticalCss()` function in `@vertz/ui-server` will be modified to always prepend the layer order declaration as the first rule in the inline critical CSS.

---

## 5. Type Flow Map

### CSS Layer Resolution Flow

```
css() call → CSSExtractor.extract() → resolveLayer(sourcePath, apiFunction) → CSSLayer → wrapInLayer(css, layer) → @layer vertz.user { ... }
```

No generic type parameters flow through this path. The layer resolution is string-based (file path analysis). No `.test-d.ts` needed.

### Router Backend Selection Flow

```
createRouter(routes, url, options?) → createNavigationBackend() → NavigationBackend → push()/replace()/onNavigate() → Router.navigate()
```

The `Router` type is unchanged. The `NavigationBackend` is internal. No new generic type parameters.

### View Transition Config Flow

```
RouteConfig.viewTransition → RouterOptions.viewTransition → withViewTransition(update, config) → document.startViewTransition()
```

```
RouteConfig<TPath, TLoaderData, TSearch> → .viewTransition: boolean | ViewTransitionConfig → withViewTransition()
```

The `ViewTransitionConfig` is a concrete type (not generic). The flow from `RouteConfig` to `withViewTransition` passes through pattern matching in `applyNavigation()`. A `.test-d.ts` should verify that `RouteConfig` accepts the `viewTransition` field.

### Popover Placement Flow

```
PopoverOptions.placement: AnchorPlacement → applyAnchorPositioning(trigger, content, anchorName, placement) → CSS position-area value
```

Concrete types, no generics. No `.test-d.ts` needed.

### Compression Flow

```
Request Accept-Encoding → negotiateEncoding() → CompressionEncoding → compressStream(stream, encoding) → compressed ReadableStream
```

No generic type parameters.

---

## 6. E2E Acceptance Test

The E2E test validates all seven features working together in a realistic application scenario.

```typescript
import { createTestApp } from '@vertz/testing';
import { renderE2E } from '@vertz/ui/test';
import { routes } from './fixtures/browser-apis-app/routes';
import { appConfig } from './fixtures/browser-apis-app/config';

/**
 * E2E acceptance test for Browser Platform APIs feature.
 *
 * Tests: @layer, native nesting, container queries, Navigation API,
 * View Transitions, Popover API, CSS Anchor Positioning, Brotli compression.
 */
test('e2e: browser platform APIs -- all seven features', async () => {
  const app = await createTestApp(appConfig);
  const {
    findByText,
    click,
    navigate,
    getHTML,
    getCSS,
    waitFor,
    getResponse,
  } = renderE2E(routes, { baseUrl: app.url });

  // ─── 1. CSS @layer ordering ───────────────────────────────────
  const cssOutput = getCSS();

  // Layer order declaration appears exactly once at the top
  expect(cssOutput).toContain('@layer vertz {');
  expect(cssOutput).toContain('@layer reset, base, primitives, components, user;');

  // Framework reset styles are in vertz.reset layer
  expect(cssOutput).toContain('@layer vertz.reset {');

  // User css() styles are in vertz.user layer
  expect(cssOutput).toContain('@layer vertz.user {');

  // User styles override framework styles without !important
  // (The test fixture has a component style and a user override with lower specificity)
  const html = getHTML();
  const userCardElement = findByText('User Card');
  // The user's background-color overrides the component's despite lower specificity
  const computedBg = getComputedStyle(userCardElement!).backgroundColor;
  expect(computedBg).toBe('rgb(59, 130, 246)'); // user's blue, not component's gray

  // ─── 2. Native CSS nesting ────────────────────────────────────
  // CSS output uses & nesting syntax, not flattened rules
  expect(cssOutput).toMatch(/\._[a-f0-9]+ \{\n.*\n\n\s+&:hover \{/m);
  // No separate flattened pseudo rules at the top level
  expect(cssOutput).not.toMatch(/\._[a-f0-9]+:hover \{/);

  // ─── 3. Container queries ─────────────────────────────────────
  expect(cssOutput).toContain('@container');
  expect(cssOutput).toContain('container-type: inline-size');

  // ─── 4. Popover API ───────────────────────────────────────────
  await navigate('/components');

  // Popover trigger has popovertarget attribute (native Popover API)
  const popoverTrigger = findByText('Open Popover');
  expect(popoverTrigger?.getAttribute('popovertarget')).toBeTruthy();

  // Popover content has popover attribute
  const popoverContent = document.getElementById(
    popoverTrigger?.getAttribute('popovertarget') ?? '',
  );
  expect(popoverContent?.getAttribute('popover')).toBe('auto');

  // Click trigger opens popover
  await click(popoverTrigger!);
  await waitFor(() => {
    expect(popoverContent?.matches(':popover-open')).toBe(true);
  });

  // Escape closes popover (native behavior)
  popoverContent?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  await waitFor(() => {
    expect(popoverContent?.matches(':popover-open')).toBe(false);
  });

  // ─── 5. CSS Anchor Positioning ────────────────────────────────
  // Popover content has anchor positioning styles
  await click(popoverTrigger!);
  await waitFor(() => {
    const styles = popoverContent?.style;
    expect(styles?.positionAnchor).toBeTruthy();
    expect(styles?.getPropertyValue('position-area')).toBeTruthy();
  });

  // ─── 6. Router Navigation API ────────────────────────────────
  // Navigate using router.navigate()
  await navigate('/dashboard');
  expect(findByText('Dashboard')).toBeTruthy();

  // Navigation API is being used (if available)
  if ('navigation' in window) {
    // Verify navigation entries reflect the navigation
    const entries = (window as any).navigation.entries();
    const lastEntry = entries[entries.length - 1];
    expect(new URL(lastEntry.url).pathname).toBe('/dashboard');
  }

  // ─── 7. View Transitions ─────────────────────────────────────
  // Navigate to a route with viewTransition: true
  // (View Transitions are opt-in -- the test fixture route has it enabled)
  if ('startViewTransition' in document) {
    const spy = vi.spyOn(document, 'startViewTransition');
    await navigate('/about');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  }

  // ─── 8. Brotli compression ───────────────────────────────────
  // Verify SSR response uses Brotli when requested
  const response = await getResponse('/', {
    headers: { 'Accept-Encoding': 'br, gzip' },
  });
  expect(response.headers.get('Content-Encoding')).toBe('br');

  // Verify gzip fallback
  const gzipResponse = await getResponse('/', {
    headers: { 'Accept-Encoding': 'gzip' },
  });
  expect(gzipResponse.headers.get('Content-Encoding')).toBe('gzip');

  // ─── 9. Dialog modal uses native <dialog> ────────────────────
  await navigate('/components');
  const dialogTrigger = findByText('Open Modal');
  await click(dialogTrigger!);
  await waitFor(() => {
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.open).toBe(true);
    // Backdrop is rendered natively
    expect(dialog?.matches(':modal')).toBe(true);
  });

  // ─── 10. Type safety ─────────────────────────────────────────
  // @ts-expect-error — viewTransition must be boolean or ViewTransitionConfig
  // defineRoutes({ '/test': { component: () => null, viewTransition: 42 } });

  // @ts-expect-error — invalid placement value
  // Popover.Root({ placement: 'center' });

  await app.close();
});
```

---

## 7. Architecture Decisions

| # | Decision | Alternatives Considered | Rationale |
|---|----------|------------------------|-----------|
| AD-1 | `NavigationBackend` abstraction instead of inline `if/else` in `navigate()` | Inline feature detection in each method | Clean separation of concerns. Testable -- can inject a mock backend. Matches the existing pattern where `createRouter` takes a `routes` list (data-driven, not hard-coded). |
| AD-2 | Nested `@layer vertz { @layer ... }` instead of top-level layer names | Top-level `@layer reset, base, ...` | Top-level names conflict with Tailwind's layer names. Nesting isolates vertz's cascade from third-party layers. Validated by Tailwind v4's approach. |
| AD-3 | `@supports (anchor-name: --a)` + dynamic import for positioning fallback | Ship both code paths unconditionally; Polyfill the CSS Anchor Positioning spec | Dynamic import means zero fallback JS in supporting browsers. Full polyfill is too large and maintenance-heavy. Shipping both unconditionally wastes bytes. |
| AD-4 | Native `<dialog>` for modal, Popover API for non-modal dialogs | Popover API for both; Native `<dialog>` for both | `<dialog>.showModal()` provides native modal behavior (inert background, focus trap, `::backdrop`). Popover API is better for non-modal overlays (top-layer without modality). Using the right API for each case. |
| AD-5 | View Transitions opt-in via `viewTransition` route config | Global opt-in only; Opt-out model; New `<ViewTransitions>` component | Per-route config gives fine-grained control. Global config is a convenience layer on top. Matches Astro's proven model. No new component needed -- it is configuration, not rendering. |
| AD-6 | Brotli quality 4 for streaming, quality 11 for static | Single quality level; Configurable per-request | Quality 4 is the sweet spot for streaming (comparable speed to gzip, better compression). Quality 11 is only appropriate for build-time pre-compression. Per-request configuration adds complexity with no user benefit. |
| AD-7 | 1 KB minimum chunk size for streaming compression | No minimum (compress everything); 4 KB minimum | 1 KB balances compression benefit vs. overhead. Chunks below 1 KB compress to approximately the same size due to Brotli header overhead. 4 KB is too aggressive -- typical Suspense chunks are 1-4 KB. |
| AD-8 | `vt-name` shorthand for `view-transition-name` | Full CSS property name only; `transition-name` shorthand | `vt-name` is concise and unambiguous. `transition-name` conflicts with CSS Transitions. Full property name is verbose for a frequently-used feature. |
| AD-9 | Container queries use existing object-form in `css()` | New dedicated `containerQuery()` API; String-based container query syntax | Zero new API surface. `@container` keys in the object form follow the same pattern as `&::after`. Consistent with "One Way to Do Things." |
| AD-10 | `container-type` and `container-name` as new shorthands | Only object-form CSS properties | Shorthands maintain consistency with existing property map. `container-type:inline-size` reads naturally and is discoverable. |

---

## 8. File Structure

### New Files

```
packages/ui-compiler/src/css-extraction/layers.ts          ← Layer resolution + wrapping
packages/ui-compiler/src/css-extraction/__tests__/layers.test.ts
packages/ui-compiler/src/build/brotli-precompress.ts       ← Static asset pre-compression
packages/ui-compiler/src/build/__tests__/brotli-precompress.test.ts

packages/ui/src/router/navigation-backend.ts               ← Navigation API abstraction
packages/ui/src/router/__tests__/navigation-backend.test.ts
packages/ui/src/router/view-transitions.ts                 ← View Transitions wrapper
packages/ui/src/router/__tests__/view-transitions.test.ts

packages/primitives/src/utils/popover.ts                   ← Popover API utilities
packages/primitives/src/utils/__tests__/popover.test.ts
packages/primitives/src/utils/anchor.ts                    ← CSS Anchor Positioning utilities
packages/primitives/src/utils/__tests__/anchor.test.ts
packages/primitives/src/utils/fallback-positioning.ts      ← JS positioning fallback
packages/primitives/src/utils/__tests__/fallback-positioning.test.ts

packages/ui-server/src/compression.ts                      ← Brotli/gzip streaming compression
packages/ui-server/src/__tests__/compression.test.ts
```

### Modified Files

```
packages/ui-compiler/src/css-extraction/extractor.ts       ← Add nesting output + layer assignment
packages/ui-compiler/src/css-extraction/__tests__/css-extraction.test.ts
packages/ui-compiler/src/css-extraction/index.ts           ← Export new layer types
packages/ui-compiler/src/transformers/css-transformer.ts   ← Add nesting output
packages/ui-compiler/src/transformers/__tests__/css-transformer.test.ts

packages/ui/src/css/css.ts                                 ← Handle @container keys in object form
packages/ui/src/css/__tests__/css.test.ts
packages/ui/src/css/token-resolver.ts                      ← Add container-type, container-name, vt-name
packages/ui/src/css/__tests__/token-resolver.test.ts       ← (not yet created, needs adding)
packages/ui/src/css/shorthand-parser.ts                    ← (unchanged -- @container is object-form)
packages/ui/src/css/index.ts                               ← Export new types if any
packages/ui/src/css/global-css.ts                          ← (unchanged -- layer wrapping is in compiler)
packages/ui/src/css/variants.ts                            ← (unchanged -- delegates to css())
packages/ui/src/router/navigate.ts                         ← Use NavigationBackend, add view transitions
packages/ui/src/router/__tests__/navigate.test.ts
packages/ui/src/router/define-routes.ts                    ← Add viewTransition to RouteConfig
packages/ui/src/router/__tests__/define-routes.test.ts
packages/ui/src/router/__tests__/router.test-d.ts          ← Type test for viewTransition
packages/ui/src/router/index.ts                            ← Export ViewTransitionConfig, RouterOptions
packages/ui/src/index.ts                                   ← Export new router types

packages/primitives/src/popover/popover.ts                 ← Popover API migration
packages/primitives/src/popover/__tests__/popover.test.ts
packages/primitives/src/dialog/dialog.ts                   ← Native <dialog> for modal
packages/primitives/src/dialog/__tests__/dialog.test.ts
packages/primitives/src/select/select.ts                   ← Popover API for dropdown
packages/primitives/src/select/__tests__/select.test.ts
packages/primitives/src/combobox/combobox.ts               ← Popover API for listbox
packages/primitives/src/combobox/__tests__/combobox.test.ts
packages/primitives/src/menu/menu.ts                       ← Popover API for menu
packages/primitives/src/menu/__tests__/menu.test.ts
packages/primitives/src/tooltip/tooltip.ts                 ← Popover API for tooltip
packages/primitives/src/tooltip/__tests__/tooltip.test.ts
packages/primitives/src/utils.ts                           ← Export new utilities
packages/primitives/src/index.ts                           ← (no public API change)

packages/ui-server/src/render-to-stream.ts                 ← (unchanged)
packages/ui-server/src/critical-css.ts                     ← Prepend layer order to critical CSS
packages/ui-server/src/__tests__/critical-css.test.ts
packages/ui-server/src/index.ts                            ← Export compression utilities
```

---

## 9. Phase Breakdown

### Sub-phase 1: CSS Compiler (1.5 weeks)

**Scope:** `@layer`, native CSS nesting, container queries. Pure compiler/extractor changes with zero runtime risk.

**Tasks:**

1. **Layer system** (`packages/ui-compiler/src/css-extraction/layers.ts`)
   - Implement `resolveLayer()`, `generateLayerOrder()`, `wrapInLayer()`, `isResetSelector()`
   - Tests: layer assignment for different source paths and API functions

2. **CSSExtractor nesting output** (`packages/ui-compiler/src/css-extraction/extractor.ts`)
   - Add `CSSExtractionOptions` constructor parameter
   - Implement `buildNestedCSSRule()` for native nesting output
   - Integrate layer wrapping into extraction pipeline
   - Tests: nesting output format, layer wrapping, combined layer + nesting

3. **CSSTransformer nesting output** (`packages/ui-compiler/src/transformers/css-transformer.ts`)
   - Mirror nesting changes from extractor
   - Tests: transformed CSS uses nesting syntax

4. **Container query passthrough** (`packages/ui/src/css/css.ts`, `packages/ui-compiler/src/css-extraction/extractor.ts`)
   - Handle `@container` keys in object-form entries
   - Emit `@container` blocks inside nested rule output
   - Tests: container queries in css() produce correct CSS

5. **New shorthand properties** (`packages/ui/src/css/token-resolver.ts`, mirrored in compiler)
   - Add `container-type`, `container-name`, `vt-name` to property maps
   - Tests: shorthand resolution

6. **Container query diagnostics** (`packages/ui-compiler/src/diagnostics/css-diagnostics.ts`)
   - Warning when `@container` has no `container-type` in scope
   - Tests: diagnostic is emitted correctly

7. **Critical CSS layer order** (`packages/ui-server/src/critical-css.ts`)
   - Prepend `@layer vertz { @layer ... }` to inline critical CSS
   - Tests: layer order appears in SSR output

**Integration tests for Sub-phase 1:**

```typescript
test('css extraction produces @layer-wrapped, natively-nested CSS', () => {
  const extractor = new CSSExtractor({ nesting: true });
  const result = extractor.extract(`
    import { css } from '@vertz/ui';
    const styles = css({
      card: ['p:4', 'bg:background', 'hover:bg:primary.700'],
    });
  `, 'app/components/card.tsx');

  expect(result.css).toContain('@layer vertz.user {');
  expect(result.css).toContain('&:hover {');
  expect(result.css).not.toMatch(/\._[a-f0-9]+:hover \{/);
});

test('container queries in css() produce correct output', () => {
  const extractor = new CSSExtractor({ nesting: true });
  const result = extractor.extract(`
    import { css } from '@vertz/ui';
    const styles = css({
      sidebar: ['container-type:inline-size', 'container-name:sidebar'],
      card: ['p:4', { '@container sidebar (min-width: 300px)': ['p:8'] }],
    });
  `, 'app/components/responsive.tsx');

  expect(result.css).toContain('container-type: inline-size');
  expect(result.css).toContain('@container sidebar (min-width: 300px)');
});

test('@layer order declaration in critical CSS', () => {
  const criticalCss = inlineCriticalCss(routeCssManifest, '/');
  expect(criticalCss.startsWith('@layer vertz {')).toBe(true);
});
```

### Sub-phase 2: Router (1.5 weeks)

**Pre-requisite:** View Transitions + signal reactivity spike completed (1-2 days). Spike findings written into Unknown 4.1 above.

**Scope:** Navigation API integration, View Transitions wrapper.

**Tasks:**

1. **NavigationBackend abstraction** (`packages/ui/src/router/navigation-backend.ts`)
   - `createNavigationAPIBackend()`, `createHistoryAPIBackend()`, `createNavigationBackend()`
   - Tests: both backends with mock window objects

2. **Refactor `createRouter`** (`packages/ui/src/router/navigate.ts`)
   - Replace direct `window.history`/`popstate` with `NavigationBackend`
   - Tests: all existing router tests pass with both backends

3. **View Transitions wrapper** (`packages/ui/src/router/view-transitions.ts`)
   - `withViewTransition()` function
   - `prefers-reduced-motion` check
   - Feature detection for `startViewTransition`
   - Tests: transition wrapping with mock, reduced motion skip, fallback

4. **`RouteConfig` extension** (`packages/ui/src/router/define-routes.ts`)
   - Add `viewTransition` field to `RouteConfig`
   - Add `RouterOptions` type
   - Type test: `RouteConfig` accepts `viewTransition`

5. **Integrate View Transitions into `applyNavigation`** (`packages/ui/src/router/navigate.ts`)
   - Route-level config overrides global config
   - Tests: navigation triggers view transition when configured

6. **`vt-name` shorthand** (already done in Sub-phase 1)

**Integration tests for Sub-phase 2:**

```typescript
test('router uses Navigation API when available', () => {
  // Mock window.navigation
  const mockNav = createMockNavigationAPI();
  Object.defineProperty(window, 'navigation', { value: mockNav, configurable: true });

  const router = createRouter(routes, '/');
  await router.navigate('/about');

  expect(mockNav.navigate).toHaveBeenCalledWith('/about', { history: 'push' });

  delete (window as any).navigation;
});

test('router falls back to History API', () => {
  const pushSpy = vi.spyOn(window.history, 'pushState');
  const router = createRouter(routes, '/');
  await router.navigate('/about');

  expect(pushSpy).toHaveBeenCalledWith(null, '', '/about');
});

test('view transitions wrap navigation when enabled', async () => {
  const transitionSpy = vi.spyOn(document, 'startViewTransition')
    .mockImplementation((cb: () => void) => {
      cb();
      return { finished: Promise.resolve(), ready: Promise.resolve() } as ViewTransition;
    });

  const router = createRouter(routes, '/', { viewTransition: true });
  await router.navigate('/about');

  expect(transitionSpy).toHaveBeenCalledOnce();
  transitionSpy.mockRestore();
});

test('view transitions skipped for prefers-reduced-motion', async () => {
  const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: true,
  } as MediaQueryList);

  const transitionSpy = vi.spyOn(document, 'startViewTransition');
  const router = createRouter(routes, '/', { viewTransition: true });
  await router.navigate('/about');

  expect(transitionSpy).not.toHaveBeenCalled();
  matchMediaSpy.mockRestore();
});

test('all existing router tests pass unchanged', () => {
  // Run the full existing test suite -- no regressions.
  // This is the critical gate: the NavigationBackend refactor must be
  // a drop-in replacement with zero behavior changes.
});
```

### Sub-phase 3: Primitives + SSR (2-2.5 weeks)

**Scope:** Popover API migration for six components, CSS Anchor Positioning with fallback, Brotli compression for SSR streaming. Brotli work can run in parallel with primitives migration.

**Tasks (Primitives):**

1. **Popover utilities** (`packages/primitives/src/utils/popover.ts`)
   - `supportsPopoverAPI()`, `supportsAnchorPositioning()`, `configurePopover()`, etc.
   - Tests: feature detection, attribute setting

2. **Anchor positioning utilities** (`packages/primitives/src/utils/anchor.ts`)
   - `applyAnchorPositioning()`, placement-to-position-area mapping
   - Tests: all 12 placement values produce correct CSS

3. **Fallback positioning** (`packages/primitives/src/utils/fallback-positioning.ts`)
   - `calculateFallbackPosition()`, viewport boundary clamping
   - Tests: position calculation for all placement values, boundary clamping

4. **Popover primitive migration** (`packages/primitives/src/popover/popover.ts`)
   - Full rewrite using Popover API + anchor positioning
   - Tests: native path (all existing tests pass with popover attribute), fallback path

5. **Select primitive migration** (`packages/primitives/src/select/select.ts`)
   - Dropdown uses popover attribute for top-layer rendering
   - Tests: existing test suite passes, top-layer rendering verified

6. **Combobox primitive migration** (`packages/primitives/src/combobox/combobox.ts`)
   - Listbox uses popover attribute
   - Tests: existing test suite passes

7. **Menu primitive migration** (`packages/primitives/src/menu/menu.ts`)
   - Menu panel uses popover attribute
   - Tests: existing test suite passes

8. **Tooltip primitive migration** (`packages/primitives/src/tooltip/tooltip.ts`)
   - Tooltip content uses popover attribute with `manual` type (no light-dismiss for tooltip)
   - Tests: existing test suite passes

9. **Dialog primitive migration** (`packages/primitives/src/dialog/dialog.ts`)
   - Modal: native `<dialog>` with `showModal()`
   - Non-modal: Popover API
   - Tests: modal uses `<dialog>`, non-modal uses popover, `::backdrop` is stylable

**Tasks (SSR Compression):**

10. **Compression module** (`packages/ui-server/src/compression.ts`)
    - `negotiateEncoding()`, `compressStream()`, `ChunkBufferTransform`
    - Tests: encoding negotiation, chunk buffering, Brotli + gzip streams

11. **Static asset pre-compression** (`packages/ui-compiler/src/build/brotli-precompress.ts`)
    - Build-time Brotli (quality 11) for CSS/JS/HTML/SVG
    - Tests: .br files generated alongside originals

**Integration tests for Sub-phase 3:**

```typescript
test('Popover uses native popover attribute when supported', () => {
  // In a browser that supports Popover API:
  const { trigger, content, state } = Popover.Root({ placement: 'bottom' });
  expect(content.getAttribute('popover')).toBe('auto');
  expect(trigger.getAttribute('popovertarget')).toBe(content.id);

  // Open popover
  trigger.click();
  expect(state.open.peek()).toBe(true);

  // Native dismiss (Escape) works
  content.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  // With native popover, dismiss is handled by the browser toggle event
});

test('Dialog modal uses native <dialog> element', () => {
  const { content, state } = Dialog.Root({ modal: true });
  // content should be a <dialog> element
  expect(content.tagName).toBe('DIALOG');

  // Opening uses showModal()
  // content.state triggers showModal()
  // ::backdrop pseudo-element exists
});

test('Select dropdown escapes overflow:hidden via top layer', () => {
  const container = document.createElement('div');
  container.style.overflow = 'hidden';
  container.style.height = '50px';
  document.body.appendChild(container);

  const { trigger, content } = Select.Root();
  container.appendChild(trigger);
  container.appendChild(content);

  // Open select
  trigger.click();

  // Content is visible despite overflow:hidden (top layer)
  expect(content.matches(':popover-open')).toBe(true);
  // Content is not clipped by the container
  const contentRect = content.getBoundingClientRect();
  expect(contentRect.height).toBeGreaterThan(0);

  container.remove();
});

test('SSR streaming with Brotli compression', async () => {
  const tree = { tag: 'div', attrs: {}, children: ['Hello, world!'] };
  const stream = renderToStream(tree);
  const { stream: compressed, contentEncoding } = compressStream(stream, 'br');

  expect(contentEncoding).toBe('br');

  // Decompress and verify content
  const chunks = await collectStreamChunks(compressed);
  const decompressed = decompressBrotli(Buffer.concat(chunks));
  expect(decompressed).toContain('Hello, world!');
});

test('Brotli achieves >= 15% improvement over gzip for typical SSR payload', async () => {
  const largeTree = generateLargeSSRTree(); // 50+ components
  const stream1 = renderToStream(largeTree);
  const stream2 = renderToStream(largeTree);

  const { stream: brotliStream } = compressStream(stream1, 'br');
  const { stream: gzipStream } = compressStream(stream2, 'gzip');

  const brotliSize = await streamSize(brotliStream);
  const gzipSize = await streamSize(gzipStream);

  const improvement = ((gzipSize - brotliSize) / gzipSize) * 100;
  expect(improvement).toBeGreaterThanOrEqual(15);
});

test('fallback positioning loads dynamically when anchor positioning is unsupported', async () => {
  // Mock: supportsAnchorPositioning returns false
  vi.spyOn(anchorModule, 'supportsAnchorPositioning').mockReturnValue(false);

  const importSpy = vi.spyOn(globalThis, 'import');
  const { trigger } = Popover.Root({ placement: 'bottom' });
  trigger.click();

  // Verify dynamic import of fallback-positioning was called
  expect(importSpy).toHaveBeenCalledWith(expect.stringContaining('fallback-positioning'));
});
```

---

## 10. Dependencies Between Phases

```
Sub-phase 1 (CSS Compiler)  ──┐
                               ├── Sub-phase 3 (Primitives + SSR)
Sub-phase 2 (Router)  ────────┘
     │
     └── BLOCKED BY: View Transitions spike (1-2 days)
```

- Sub-phases 1 and 2 are **independent** and could overlap, but they share the compiler pipeline. Running them sequentially avoids merge conflicts in the shared CSS resolution code.
- Sub-phase 3 depends on Sub-phase 1 (needs `@layer` wrapping for primitives CSS and `@container` support for responsive primitives).
- Sub-phase 3 is the highest-risk sub-phase (6 component migrations + anchor positioning fallback). It comes last when the team has momentum from Sub-phases 1 and 2.
- Brotli (within Sub-phase 3) is isolated to `@vertz/ui-server` and can be developed in parallel with the primitives work.

---

## 11. POC Results

No POCs have been conducted yet. The following POC must be completed before Sub-phase 2 begins:

| POC | Question to Answer | Priority | Duration |
|-----|-------------------|----------|----------|
| **View Transitions + signal reactivity** | Does the signal-based DOM update complete within `startViewTransition()` callback? | **P0** -- blocks Sub-phase 2 | 1-2 days |

The spike findings will be written back into this design doc (Unknown 4.1), referencing the closed POC PR.
