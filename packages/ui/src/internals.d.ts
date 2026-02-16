/**
 * @vertz/ui/internals
 *
 * Compiler-internal and framework-internal exports.
 * These are used by generated code from @vertz/ui-compiler and by the framework itself.
 * Application developers should not import from this module directly.
 */
export { compileTheme } from './css';
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
export { __attr, __classList, __show } from './dom/attributes';
export { __conditional } from './dom/conditional';
export { __child, __element, __insert, __text } from './dom/element';
export { __on } from './dom/events';
export { clearChildren, insertBefore, removeNode } from './dom/insert';
export { __list } from './dom/list';
export { deserializeProps, resolveComponent } from './hydrate';
export { deriveKey, MemoryCache } from './query';
export { matchRoute } from './router/define-routes';
export { executeLoaders } from './router/loader';
export type { MatchResult } from './router/matcher';
export { matchPath } from './router/matcher';
export { popScope, pushScope, runCleanups } from './runtime/disposal';
//# sourceMappingURL=internals.d.ts.map
