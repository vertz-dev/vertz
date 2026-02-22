/**
 * Type-level tests for the router module.
 *
 * These tests verify that generic type parameters flow correctly
 * through the route definition and matching pipeline. They are
 * checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type {
  CompiledRoute,
  InferRouteMap,
  RouteConfig,
  RouteDefinitionMap,
  TypedRoutes,
} from '../define-routes';
import { defineRoutes } from '../define-routes';
import type { Router } from '../navigate';
import type { ExtractParams, PathWithParams, RoutePaths } from '../params';
import { useParams, useRouter } from '../router-context';
import type { RouterViewProps } from '../router-view';
import { RouterView } from '../router-view';

// ─── ExtractParams positive tests ──────────────────────────────────────────

// Static path produces empty params
type StaticParams = ExtractParams<'/about'>;
const _static: StaticParams = {} as Record<string, never>;
void _static;

// Single param
type SingleParam = ExtractParams<'/users/:id'>;
const _single: SingleParam = { id: '123' };
void _single;

// Multiple params
type MultiParam = ExtractParams<'/users/:id/posts/:postId'>;
const _multi: MultiParam = { id: '1', postId: '42' };
void _multi;

// Wildcard
type WildcardParam = ExtractParams<'/files/*'>;
const _wildcard: WildcardParam = { '*': 'path/to/file' };
void _wildcard;

// Param + wildcard
type ParamWildcard = ExtractParams<'/users/:id/*'>;
const _paramWild: ParamWildcard = { '*': 'extra', id: '1' };
void _paramWild;

// ─── ExtractParams negative tests (compiler must reject) ───────────────────

// @ts-expect-error - static path should not accept arbitrary params
const _badStatic: ExtractParams<'/about'> = { id: '123' };
void _badStatic;

// @ts-expect-error - missing required param 'id'
const _missingParam: ExtractParams<'/users/:id'> = {};
void _missingParam;

// @ts-expect-error - wrong param name
const _wrongParam: ExtractParams<'/users/:id'> = { name: '123' };
void _wrongParam;

// @ts-expect-error - missing second param 'postId'
const _missingSecond: ExtractParams<'/users/:id/posts/:postId'> = { id: '1' };
void _missingSecond;

// ─── RouteConfig loader params flow ────────────────────────────────────────

// Loader params must match ExtractParams<TPath>
const _routeWithLoader: RouteConfig<'/users/:id', { name: string }> = {
  component: () => document.createElement('div'),
  loader: ({ params }) => {
    // params.id should be string
    const _id: string = params.id;
    void _id;

    // @ts-expect-error - 'name' does not exist on ExtractParams<'/users/:id'>
    const _bad: string = params.name;
    void _bad;

    return Promise.resolve({ name: 'Alice' });
  },
};
void _routeWithLoader;

// End-to-end: params flow from path literal through RouteConfig.loader
const _nestedRoute: RouteConfig<'/orgs/:orgId/repos/:repoId', { stars: number }> = {
  component: () => document.createElement('div'),
  loader: ({ params }) => {
    const _orgId: string = params.orgId;
    const _repoId: string = params.repoId;
    void _orgId;
    void _repoId;

    // @ts-expect-error - 'id' does not exist
    const _noId: string = params.id;
    void _noId;

    return { stars: 42 };
  },
};
void _nestedRoute;

// ─── Loader context: signal property ─────────────────────────────────────────

// signal should be AbortSignal in loader context
const _routeWithSignal: RouteConfig<'/items/:id', { item: string }> = {
  component: () => document.createElement('div'),
  loader: ({ params, signal }) => {
    const _id: string = params.id;
    void _id;

    // signal should be AbortSignal
    const _signal: AbortSignal = signal;
    void _signal;

    return { item: 'test' };
  },
};
void _routeWithSignal;

// Non-existent context property should be rejected
const _routeBadCtx: RouteConfig<'/items/:id', { item: string }> = {
  component: () => document.createElement('div'),
  loader: (ctx) => {
    // @ts-expect-error - 'badProp' does not exist on loader context
    const _bad = ctx.badProp;
    void _bad;
    return { item: 'test' };
  },
};
void _routeBadCtx;

// ─── PathWithParams type tests ──────────────────────────────────────────────

// Single param: '/tasks/:id' → `/tasks/${string}`
const _pwp1: PathWithParams<'/tasks/:id'> = `/tasks/${'42'}`;
void _pwp1;

// Multi param: '/users/:id/posts/:postId' → `/users/${string}/posts/${string}`
const _pwp2: PathWithParams<'/users/:id/posts/:postId'> = `/users/${'a'}/posts/${'b'}`;
void _pwp2;

// Wildcard: '/files/*' → `/files/${string}`
const _pwp3: PathWithParams<'/files/*'> = '/files/any/path';
void _pwp3;

// Backward compat: PathWithParams<string> = string
const _pwp4: PathWithParams<string> = 'anything';
void _pwp4;

// Trailing slash: '/tasks/:id/' → `/tasks/${string}/`
const _pwp5: PathWithParams<'/tasks/:id/'> = '/tasks/42/';
void _pwp5;

// Static path passthrough: '/' → '/'
const _pwp6: PathWithParams<'/'> = '/';
void _pwp6;

// Param + wildcard: '/users/:id/*' → `/users/${string}/${string}`
const _pwp7: PathWithParams<'/users/:id/*'> = `/users/${'a'}/${'any/path'}`;
void _pwp7;

// @ts-expect-error - '/tasks' missing param segment, not assignable to `/tasks/${string}`
const _pwpNeg: PathWithParams<'/tasks/:id'> = '/tasks';
void _pwpNeg;

// ─── RoutePaths type tests ──────────────────────────────────────────────────

type TestRouteMap = {
  '/': RouteConfig;
  '/tasks/:id': RouteConfig;
  '/settings': RouteConfig;
};

type TestPaths = RoutePaths<TestRouteMap>;

// Valid paths compile
const _rp1: TestPaths = '/';
const _rp2: TestPaths = '/tasks/42';
const _rp3: TestPaths = '/settings';
void _rp1;
void _rp2;
void _rp3;

// @ts-expect-error - '/nonexistent' is not a valid path
const _rpBad: TestPaths = '/nonexistent';
void _rpBad;

// Backward compat: RoutePaths<RouteDefinitionMap> = string (string index sig)
type FallbackPaths = RoutePaths<RouteDefinitionMap>;
const _rpFallback: FallbackPaths = '/literally-anything';
void _rpFallback;

// Empty route map (literal object with no keys) produces never
// biome-ignore lint/complexity/noBannedTypes: testing empty object type behavior
type EmptyMap = {};
type EmptyPaths = RoutePaths<EmptyMap>;
// @ts-expect-error - never accepts nothing
const _rpEmpty: EmptyPaths = '/anything';
void _rpEmpty;

// ─── defineRoutes + TypedRoutes type tests ───────────────────────────────────

// Cycle 1: defineRoutes preserves literal keys via const T
const _typedRoutes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': {
    component: () => document.createElement('div'),
    loader: ({ params }) => {
      // Cycle 3: loader accessing params.id must compile
      // With noUncheckedIndexedAccess, Record<string, string> index is string | undefined
      const _id: string | undefined = params.id;
      void _id;
      return {};
    },
  },
});

// Literal key '/tasks/:id' is preserved in the phantom type
type P2RouteMap = (typeof _typedRoutes)['__routes'];
type P2Keys = keyof P2RouteMap;
const _p2Key1: P2Keys = '/';
const _p2Key2: P2Keys = '/tasks/:id';
void _p2Key1;
void _p2Key2;

// @ts-expect-error - '/nonexistent' is not a key in the route map
const _p2BadKey: P2Keys = '/nonexistent';
void _p2BadKey;

// Cycle 2: TypedRoutes<T> is assignable to CompiledRoute[]
const _asArray: CompiledRoute[] = _typedRoutes;
void _asArray;

// Cycle 4: Array spread strips the phantom brand (intentional)
const _spread = [..._typedRoutes];
const _spreadCheck: CompiledRoute[] = _spread;
void _spreadCheck;

// TypedRoutes default (RouteDefinitionMap) is backward-compatible
declare const _defaultRoutes: TypedRoutes;
const _defaultAsArray: CompiledRoute[] = _defaultRoutes;
void _defaultAsArray;

// ─── createRouter + TypedRouter type tests ──────────────────────────────────

import type { TypedRouter } from '../navigate';
// Phase 3 Cycle 1: createRouter returns TypedRouter, navigate rejects invalid paths
import { createRouter } from '../navigate';

const _p3Routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': { component: () => document.createElement('div') },
  '/settings': { component: () => document.createElement('div') },
});

const _p3Router = createRouter(_p3Routes);

// @ts-expect-error - '/nonexistent' is not a valid path for this route map
_p3Router.navigate('/nonexistent');

// @ts-expect-error - '/tasks' without param is not valid
_p3Router.navigate('/tasks');

// Phase 3 Cycle 2: valid paths compile
_p3Router.navigate('/');
_p3Router.navigate('/settings');
_p3Router.navigate('/tasks/42');

// Phase 3 Cycle 3: TypedRouter<T> is assignable to Router (context boundary)
const _p3AsRouter: Router = _p3Router;
void _p3AsRouter;

// TypedRouter type can be used directly
type P3RouteMap = (typeof _p3Routes)['__routes'];
const _p3Typed: TypedRouter<P3RouteMap> = _p3Router;
void _p3Typed;

// Phase 3 Cycle 4: Plain Router still accepts any string (backward compat)
declare const _plainRouter: Router;
_plainRouter.navigate('/anything-goes');

// ─── RouterContext + useRouter + RouterView type tests ──────────────────────

// useRouter() returns Router
const _routerResult: Router = useRouter();
void _routerResult;

// RouterView returns HTMLElement
declare const _mockRouter: Router;
const _viewResult: HTMLElement = RouterView({ router: _mockRouter });
void _viewResult;

// RouterView accepts optional fallback
const _viewWithFallback: HTMLElement = RouterView({
  router: _mockRouter,
  fallback: () => document.createElement('div'),
});
void _viewWithFallback;

// @ts-expect-error - RouterView requires router prop
const _viewNoRouter = RouterView({});
void _viewNoRouter;

// @ts-expect-error - RouterView router must be Router type, not string
const _viewBadRouter = RouterView({ router: 'not-a-router' });
void _viewBadRouter;

// RouterViewProps type structure
const _props: RouterViewProps = { router: _mockRouter };
void _props;

// ─── Phase 4: useParams + useRouter<T> + InferRouteMap type tests ───────────

// Phase 4 Cycle 1: useParams<TPath> returns ExtractParams<TPath>
const _p4Params = useParams<'/tasks/:id'>();
const _p4Id: string = _p4Params.id;
void _p4Id;

// @ts-expect-error - 'name' does not exist on ExtractParams<'/tasks/:id'>
const _p4Bad = _p4Params.name;
void _p4Bad;

// Phase 4 Cycle 2: useParams() (no param) returns ExtractParams<string> — backward compat
const _p4Untyped = useParams();
void _p4Untyped;

// Phase 4 Cycle 3: useRouter<T>() returns Router<T> with typed navigate
const _p4Routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': { component: () => document.createElement('div') },
  '/settings': { component: () => document.createElement('div') },
});

const _p4TypedRouter = useRouter<InferRouteMap<typeof _p4Routes>>();

// Valid paths compile
_p4TypedRouter.navigate('/');
_p4TypedRouter.navigate('/settings');
_p4TypedRouter.navigate('/tasks/42');

// @ts-expect-error - '/nonexistent' is not a valid path
_p4TypedRouter.navigate('/nonexistent');

// @ts-expect-error - '/tasks' without param is not valid
_p4TypedRouter.navigate('/tasks');

// Phase 4 Cycle 4: useRouter() (no param) returns Router — backward compat
const _p4UntypedRouter = useRouter();
_p4UntypedRouter.navigate('/anything'); // OK — string accepted
const _p4AsRouter: Router = _p4UntypedRouter;
void _p4AsRouter;

// Phase 4 Cycle 5: InferRouteMap extracts route map from TypedRoutes<T>
type P4RouteMap = InferRouteMap<typeof _p4Routes>;
type P4Keys = keyof P4RouteMap;
const _p4Key1: P4Keys = '/';
const _p4Key2: P4Keys = '/tasks/:id';
const _p4Key3: P4Keys = '/settings';
void _p4Key1;
void _p4Key2;
void _p4Key3;

// @ts-expect-error - '/nonexistent' is not a key
const _p4BadKey: P4Keys = '/nonexistent';
void _p4BadKey;

// InferRouteMap on non-TypedRoutes returns T as-is (passthrough)
type P4Passthrough = InferRouteMap<{ '/': RouteConfig }>;
const _p4PassKey: keyof P4Passthrough = '/';
void _p4PassKey;
