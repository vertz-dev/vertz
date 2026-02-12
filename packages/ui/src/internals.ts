/**
 * @vertz/ui/internals
 *
 * Compiler-internal and framework-internal exports.
 * These are used by generated code from @vertz/ui-compiler and by the framework itself.
 * Application developers should not import from this module directly.
 */

// CSS build-time utility
export { compileTheme } from './css';
// DOM helpers (used by compiler-generated JSX output)
export { __attr, __classList, __show } from './dom/attributes';
export { __conditional } from './dom/conditional';
export { __element, __text } from './dom/element';
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
export type { MatchResult } from './router/matcher';
export { matchPath } from './router/matcher';
// Runtime scope management (used by component lifecycle internals)
export { popScope, pushScope, runCleanups } from './runtime/disposal';
