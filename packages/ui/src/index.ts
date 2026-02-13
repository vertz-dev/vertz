// Component model
export type { ChildrenAccessor, ChildValue } from './component/children';
export { children, resolveChildren } from './component/children';
export type { Context } from './component/context';
export { createContext, useContext } from './component/context';
export type { ErrorBoundaryProps } from './component/error-boundary';
export { ErrorBoundary } from './component/error-boundary';
export { onMount, watch } from './component/lifecycle';
export type { Ref } from './component/refs';
export { ref } from './component/refs';
export type { SuspenseProps } from './component/suspense';
export { Suspense } from './component/suspense';

// CSS & Theming
export type {
  CompiledTheme,
  CSSInput,
  CSSOutput,
  GlobalCSSInput,
  GlobalCSSOutput,
  StyleEntry,
  Theme,
  ThemeInput,
  ThemeProviderProps,
  VariantFunction,
  VariantProps,
  VariantsConfig,
} from './css';
export { compileTheme, css, defineTheme, globalCss, s, ThemeProvider, variants } from './css';

// Forms
export type { FormInstance, FormOptions, SdkMethod, SubmitCallbacks } from './form/form';
export { form } from './form/form';
export type { FormDataOptions } from './form/form-data';
export { formDataToObject } from './form/form-data';
export type { FormSchema, ValidationResult } from './form/validation';
export { validate } from './form/validation';

// Hydration (public API only)
export type { ComponentFunction, ComponentLoader, ComponentRegistry } from './hydrate';
export {
  eagerStrategy,
  hydrate,
  idleStrategy,
  interactionStrategy,
  lazyStrategy,
  mediaStrategy,
  visibleStrategy,
} from './hydrate';

// Data fetching
export type { CacheStore, QueryOptions, QueryResult } from './query';
export { query } from './query';

// Router
export type {
  CompiledRoute,
  LoaderData,
  MatchedRoute,
  RouteConfig,
  RouteDefinitionMap,
  RouteMatch,
  SearchParamSchema,
} from './router/define-routes';
export { defineRoutes } from './router/define-routes';
export type { LinkProps } from './router/link';
export { createLink } from './router/link';
export type { NavigateOptions, Router } from './router/navigate';
export { createRouter } from './router/navigate';
export type { OutletContext } from './router/outlet';
export { createOutlet } from './router/outlet';
export type { ExtractParams } from './router/params';
export { parseSearchParams, useSearchParams } from './router/search-params';

// Reactivity runtime
export { DisposalScopeError, onCleanup } from './runtime/disposal';
export { batch } from './runtime/scheduler';
export { computed, effect, signal } from './runtime/signal';
export type {
  Computed,
  DisposeFn,
  ReadonlySignal,
  Signal,
} from './runtime/signal-types';
export { untrack } from './runtime/tracking';
