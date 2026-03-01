// Component model
export type { ChildrenAccessor, ChildValue } from './component/children';
export { children, resolveChildren } from './component/children';
export type { Context } from './component/context';
export { createContext, useContext } from './component/context';
export type { ErrorBoundaryProps } from './component/error-boundary';
export { ErrorBoundary } from './component/error-boundary';
export { onMount } from './component/lifecycle';
export type { PresenceProps } from './component/presence';
export { Presence } from './component/presence';
export type { Ref } from './component/refs';
export { ref } from './component/refs';
export type { SuspenseProps } from './component/suspense';
export { Suspense } from './component/suspense';

// CSS & Theming
export type {
  ColorPalette,
  CompiledTheme,
  CSSInput,
  CSSOutput,
  GlobalCSSInput,
  GlobalCSSOutput,
  RawDeclaration,
  StyleEntry,
  StyleValue,
  Theme,
  ThemeInput,
  ThemeProviderProps,
  VariantFunction,
  VariantProps,
  VariantsConfig,
} from './css';
export {
  ANIMATION_DURATION,
  ANIMATION_EASING,
  accordionDown,
  accordionUp,
  compileTheme,
  css,
  defineTheme,
  fadeIn,
  fadeOut,
  getInjectedCSS,
  globalCss,
  injectCSS,
  keyframes,
  palettes,
  resetInjectedStyles,
  s,
  slideInFromBottom,
  slideInFromLeft,
  slideInFromRight,
  slideInFromTop,
  slideOutToBottom,
  slideOutToLeft,
  slideOutToRight,
  slideOutToTop,
  ThemeProvider,
  variants,
  zoomIn,
  zoomOut,
} from './css';
// Render adapter
export type { RenderAdapter, RenderElement, RenderNode, RenderText } from './dom/adapter';
export { getAdapter, isRenderNode, RENDER_NODE_BRAND, setAdapter } from './dom/adapter';
export { createDOMAdapter } from './dom/dom-adapter';
// DOM primitives (compiler output targets, also used by app shells for hydration)
export { __append, __element, __enterChildren, __exitChildren, __staticText } from './dom/element';
// Forms
export type { FieldState } from './form/field-state';
export { createFieldState } from './form/field-state';
export type {
  FormInstance,
  FormOptions,
  SdkMethod,
  SdkMethodWithMeta,
} from './form/form';
export { form } from './form/form';
export type { FormDataOptions } from './form/form-data';
export { formDataToObject } from './form/form-data';
export type { FormSchema, ValidationResult } from './form/validation';
export { validate } from './form/validation';
// Hydration (public API only)
export type { ComponentFunction, ComponentLoader, ComponentRegistry } from './hydrate';
export { hydrate } from './hydrate';
export type { MountHandle, MountOptions } from './mount';
// Mount API
export { mount } from './mount';
// Data fetching
export type {
  CacheStore,
  QueryDescriptor,
  QueryMatchHandlers,
  QueryOptions,
  QueryResult,
} from './query';
export { isQueryDescriptor, query, queryMatch } from './query';
// Router
export type {
  CompiledRoute,
  InferRouteMap,
  LoaderData,
  MatchedRoute,
  RouteConfig,
  RouteDefinitionMap,
  RouteMatch,
  SearchParamSchema,
  TypedRoutes,
} from './router/define-routes';
export { defineRoutes } from './router/define-routes';
export type { LinkFactoryOptions, LinkProps } from './router/link';
export { createLink } from './router/link';
export type { NavigateOptions, Router, RouterOptions, TypedRouter } from './router/navigate';
export { createRouter } from './router/navigate';
export type { OutletContextValue } from './router/outlet';
export { Outlet, OutletContext } from './router/outlet';
export type { ExtractParams, PathWithParams, RoutePaths } from './router/params';
export { RouterContext, useParams, useRouter } from './router/router-context';
export type { RouterViewProps } from './router/router-view';
export { RouterView } from './router/router-view';
export { parseSearchParams, useSearchParams } from './router/search-params';

// Reactivity runtime
export { DisposalScopeError } from './runtime/disposal';
export { batch } from './runtime/scheduler';
export { computed, signal } from './runtime/signal';
export type {
  Computed,
  DisposeFn,
  ReadonlySignal,
  Signal,
  UnwrapSignals,
} from './runtime/signal-types';
export { untrack } from './runtime/tracking';
// Entity store
export type { EntityStoreOptions, SerializedStore } from './store';
export { createTestStore, EntityStore } from './store';
