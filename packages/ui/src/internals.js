/**
 * @vertz/ui/internals
 *
 * Compiler-internal and framework-internal exports.
 * These are used by generated code from @vertz/ui-compiler and by the framework itself.
 * Application developers should not import from this module directly.
 */
// CSS build-time utility
export { compileTheme } from './css';
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
// DOM helpers (used by compiler-generated JSX output)
export { __attr, __classList, __show } from './dom/attributes';
export { __conditional } from './dom/conditional';
export { __child, __element, __insert, __text } from './dom/element';
export { __on } from './dom/events';
export { clearChildren, insertBefore, removeNode } from './dom/insert';
export { __list } from './dom/list';
// Hydration internals (used by generated hydration bootstrap)
export { deserializeProps, resolveComponent } from './hydrate';
// Query internals
export { deriveKey, MemoryCache } from './query';
export { matchRoute } from './router/define-routes';
// Router internals (used by framework plumbing, not application code)
export { executeLoaders } from './router/loader';
export { matchPath } from './router/matcher';
// Runtime scope management (used by component lifecycle internals)
export { popScope, pushScope, runCleanups } from './runtime/disposal';
//# sourceMappingURL=internals.js.map
