// Environment detection

// Component model
export type { ChildrenAccessor, ChildValue } from './component/children';
export { children, resolveChildren } from './component/children';
export type { Context } from './component/context';
export { createContext, useContext } from './component/context';
export type { ErrorBoundaryProps } from './component/error-boundary';
export { ErrorBoundary } from './component/error-boundary';
export type { ForeignProps } from './component/foreign';
export { Foreign } from './component/foreign';
export { onMount } from './component/lifecycle';
export type { ListTransitionProps } from './component/list-transition';
export { ListTransition } from './component/list-transition';
export type { PresenceProps } from './component/presence';
export { Presence } from './component/presence';
export type { Ref } from './component/refs';
export { ref } from './component/refs';
export type { SuspenseProps } from './component/suspense';
export { Suspense } from './component/suspense';
// CSS & Theming
export type {
  ColorPalette,
  CompiledFonts,
  CompiledTheme,
  CompileFontsOptions,
  CompileThemeOptions,
  CSSInput,
  CSSOutput,
  FallbackFontName,
  FontDescriptor,
  FontFallbackMetrics,
  FontOptions,
  FontSrc,
  GlobalCSSInput,
  GlobalCSSOutput,
  PreloadItem,
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
  compileFonts,
  compileTheme,
  css,
  defineTheme,
  fadeIn,
  fadeOut,
  font,
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
// Dialog stack
export type {
  DialogComponent,
  DialogHandle,
  DialogOpenOptions,
  DialogResult,
  DialogStack,
} from './dialog';
export {
  createDialogStack,
  DialogHandleContext,
  DialogIdContext,
  DialogStackContext,
  DialogStackProvider,
  useDialog,
  useDialogStack,
} from './dialog';
// Render adapter
export type { RenderAdapter, RenderElement, RenderNode, RenderText } from './dom/adapter';
export { getAdapter, isRenderNode, RENDER_NODE_BRAND, setAdapter } from './dom/adapter';
// DOM primitives (compiler output targets, also used by app shells for hydration)
export { onAnimationsComplete } from './dom/animation';
export { createDOMAdapter } from './dom/dom-adapter';
export { __append, __element, __enterChildren, __exitChildren, __staticText } from './dom/element';
export { isBrowser } from './env/is-browser';
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
// Formatting
export type { DateInput, FormatRelativeTimeOptions, RelativeTimeProps } from './format';
export { formatRelativeTime, RelativeTime } from './format';
// Hydration (public API only)
export type {
  ComponentFunction,
  ComponentLoader,
  ComponentRegistry,
  IslandRegistry,
} from './hydrate';
export { hydrate, hydrateIslands } from './hydrate';
export { buildOptimizedUrl, configureImageOptimizer } from './image/config';
export { Image } from './image/image';
// Image
export type { ImageProps } from './image/types';
// Island component
export type { IslandProps } from './island/island';
export { Island } from './island/island';
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
export { invalidate, invalidateTenantQueries, isQueryDescriptor, query, queryMatch } from './query';
// Router
export type {
  CompiledRoute,
  InferRouteMap,
  LoaderData,
  MatchedRoute,
  ParamSchema,
  RouteConfig,
  RouteDefinitionMap,
  RouteMatch,
  SearchParamSchema,
  TypedRoutes,
} from './router/define-routes';
export { defineRoutes } from './router/define-routes';
export type { LinkFactoryOptions, LinkProps } from './router/link';
export { createLink, Link } from './router/link';
export type {
  NavigateInput,
  NavigateOptions,
  Router,
  RouterOptions,
  TypedRouter,
} from './router/navigate';
export { createRouter } from './router/navigate';
export type { OutletContextValue } from './router/outlet';
export { Outlet, OutletContext } from './router/outlet';
export type { ExtractParams, PathWithParams, RoutePaths, RoutePattern } from './router/params';
export { RouterContext, useParams, useRouter } from './router/router-context';
export type { RouterViewProps } from './router/router-view';
export { RouterView } from './router/router-view';
export { parseSearchParams, useSearchParams } from './router/search-params';
// Reactivity runtime
export { DisposalScopeError, onCleanup } from './runtime/disposal';
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
export type {
  EntityStoreOptions,
  MergeSelectOptions,
  QueryEnvelope,
  RelationFieldDef,
  RelationSchema,
  SerializedStore,
} from './store';
export {
  createOptimisticHandler,
  createTestStore,
  EntityStore,
  FieldSelectionTracker,
  getEntityStore,
  getQueryEnvelopeStore,
  getRelationSchema,
  QueryEnvelopeStore,
  registerRelationSchema,
  resetRelationSchemas_TEST_ONLY,
} from './store';
// Theme registry
export type { RegisterThemeInput } from './theme/registry';
export { registerTheme } from './theme/registry';
