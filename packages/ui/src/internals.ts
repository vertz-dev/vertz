/**
 * @vertz/ui/internals
 *
 * Compiler-internal and framework-internal exports.
 * These are used by generated code from @vertz/ui-compiler and by the framework itself.
 * Application developers should not import from this module directly.
 */

// Context scope management (used by HMR Fast Refresh runtime)
export { getContextScope, setContextScope } from './component/context';
// Mount frame stack (used by compiler-generated mount frame wrappers)
export { __discardMountFrame, __flushMountFrame, __pushMountFrame } from './component/lifecycle';
// CSS build-time utility
export { compileTheme } from './css';
// Shared CSS token tables — single source of truth for runtime and compiler
export type { CSSDeclarationEntry, PropertyMapping } from './css/token-tables';
export {
  ALIGNMENT_MAP,
  COLOR_NAMESPACES,
  CONTENT_MAP,
  CSS_COLOR_KEYWORDS,
  DISPLAY_MAP,
  FONT_SIZE_SCALE,
  FONT_WEIGHT_SCALE,
  HEIGHT_AXIS_PROPERTIES,
  KEYWORD_MAP,
  LINE_HEIGHT_SCALE,
  PROPERTY_MAP,
  PSEUDO_MAP,
  PSEUDO_PREFIXES,
  RADIUS_SCALE,
  SHADOW_SCALE,
  SIZE_KEYWORDS,
  SPACING_SCALE,
} from './css/token-tables';
// Render adapter (used by SSR adapter and other rendering backends)
export type { RenderAdapter, RenderElement, RenderNode, RenderText } from './dom/adapter';
export { getAdapter, isRenderNode, RENDER_NODE_BRAND, setAdapter } from './dom/adapter';
// Animation utilities (used by sibling packages like ui-primitives)
export { onAnimationsComplete } from './dom/animation';
// DOM helpers (used by compiler-generated JSX output)
export { __attr, __classList, __prop, __show } from './dom/attributes';
export { __conditional } from './dom/conditional';
export { createDOMAdapter } from './dom/dom-adapter';
export {
  __append,
  __child,
  __element,
  __enterChildren,
  __exitChildren,
  __insert,
  __staticText,
  __text,
} from './dom/element';
export { __on } from './dom/events';
export { __formOnChange } from './dom/form-on-change';
export { clearChildren, insertBefore, removeNode } from './dom/insert';
export { __list } from './dom/list';
export type { ListAnimationHooks } from './dom/list-animation-context';
export { ListAnimationContext } from './dom/list-animation-context';
export { __listValue } from './dom/list-value';
export { __spread } from './dom/spread';
export { __styleStr } from './dom/style';
// Environment detection (used by internal packages for SSR/browser checks)
export { isBrowser } from './env/is-browser';
// Hydration internals (used by generated hydration bootstrap)
export { deserializeProps, resolveComponent } from './hydrate';
// Query internals
export { deriveKey, MemoryCache } from './query';
export { matchRoute } from './router/define-routes';
// Router internals (used by framework plumbing, not application code)
export { executeLoaders } from './router/loader';
export type { MatchResult } from './router/matcher';
export { matchPath } from './router/matcher';
// Runtime scope management (used by component lifecycle internals and sibling packages)
export { _tryOnCleanup, onCleanup, popScope, pushScope, runCleanups } from './runtime/disposal';
// Effect primitives (used by sibling packages that can't go through the compiler)
// Signal collection (used by HMR Fast Refresh runtime for state preservation)
export {
  domEffect,
  lifecycleEffect,
  startSignalCollection,
  stopSignalCollection,
} from './runtime/signal';
// SSR per-request isolation (used by @vertz/ui-server to register the ALS-backed resolver)
export type { SSRAuth, SSRQueryEntry, SSRRenderContext } from './ssr/ssr-render-context';
export { getSSRContext, hasSSRResolver, registerSSRResolver } from './ssr/ssr-render-context';
// Store classes (used by @vertz/ui-server to create per-request SSR context)
export { EntityStore } from './store/entity-store';
export { QueryEnvelopeStore } from './store/query-envelope-store';
