/**
 * E2E type acceptance test for the type-safe router feature.
 *
 * Created in Phase 1 as a failing (RED) test. Each subsequent phase
 * makes more of this file compile. The feature is done when the
 * entire file typechecks cleanly.
 *
 * @see plans/type-safe-router.md (design doc)
 * @see plans/type-safe-router-impl.md (implementation plan)
 */

// Phase 2: TypedRoutes now exists
// Phase 4: InferRouteMap now exists
import type { CompiledRoute, InferRouteMap, TypedRoutes } from '../define-routes';
import { defineRoutes } from '../define-routes';
// Phase 3: TypedRouter now exists
import type { Router, TypedRouter } from '../navigate';
import { createRouter } from '../navigate';
// Phase 1: these imports exist
import type { PathWithParams, RoutePaths } from '../params';
// Phase 4: useParams and useRouter<T>
import { useParams, useRouter } from '../router-context';

// Phase 1: PathWithParams and RoutePaths work
const _pwp: PathWithParams<'/tasks/:id'> = '/tasks/42';
void _pwp;

import type { RouteConfig } from '../define-routes';

type E2ERouteMap = {
  '/': RouteConfig;
  '/tasks/:id': RouteConfig;
  '/users/:userId/posts/:postId': RouteConfig;
  '/settings': RouteConfig;
  '/files/*': RouteConfig;
};

type E2EPaths = RoutePaths<E2ERouteMap>;

const _p1: E2EPaths = '/';
const _p2: E2EPaths = '/tasks/42';
const _p3: E2EPaths = '/users/1/posts/99';
const _p4: E2EPaths = '/settings';
const _p5: E2EPaths = '/files/docs/readme.md';
void _p1;
void _p2;
void _p3;
void _p4;
void _p5;

// @ts-expect-error - invalid path
const _bad1: E2EPaths = '/nonexistent';
void _bad1;

// @ts-expect-error - partial param path
const _bad2: E2EPaths = '/tasks';
void _bad2;

// ─── Phase 2: defineRoutes<const T>() preserves literal keys ────────────────

const _e2eRoutes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': { component: () => document.createElement('div') },
  '/users/:userId/posts/:postId': { component: () => document.createElement('div') },
  '/settings': { component: () => document.createElement('div') },
  '/files/*': { component: () => document.createElement('div') },
});

// Literal keys preserved via phantom type
type E2EKeys = keyof (typeof _e2eRoutes)['__routes'];
const _e2eKey1: E2EKeys = '/';
const _e2eKey2: E2EKeys = '/tasks/:id';
const _e2eKey3: E2EKeys = '/settings';
void _e2eKey1;
void _e2eKey2;
void _e2eKey3;

// TypedRoutes assignable to CompiledRoute[]
const _e2eAsArray: CompiledRoute[] = _e2eRoutes;
void _e2eAsArray;

// defineRoutes return type is TypedRoutes
const _e2eTyped: TypedRoutes<(typeof _e2eRoutes)['__routes']> = _e2eRoutes;
void _e2eTyped;

// ─── Phase 3: createRouter<T>() → Router<T> with typed navigate ─────────────

const _e2eRouter = createRouter(_e2eRoutes);

// Typed navigate: valid route patterns compile
_e2eRouter.navigate({ to: '/' });
_e2eRouter.navigate({ to: '/tasks/:id', params: { id: '42' } });
_e2eRouter.navigate({
  to: '/users/:userId/posts/:postId',
  params: { postId: '99', userId: '1' },
});
_e2eRouter.navigate({ to: '/settings' });
_e2eRouter.navigate({ to: '/files/*', params: { '*': 'docs/readme.md' } });

// @ts-expect-error - invalid route pattern
_e2eRouter.navigate({ to: '/nonexistent' });

// @ts-expect-error - partial param route is not defined
_e2eRouter.navigate({ to: '/tasks' });

// @ts-expect-error - params required for dynamic route patterns
_e2eRouter.navigate({ to: '/tasks/:id' });

// @ts-expect-error - wrong param keys
_e2eRouter.navigate({ to: '/tasks/:id', params: { taskId: '42' } });

// Router<T> assignable to Router (context boundary via bivariant method syntax)
const _e2eAsRouter: Router = _e2eRouter;
void _e2eAsRouter;

// TypedRouter<T> is identical to Router<T>
type E2ERouteMapFromRoutes = (typeof _e2eRoutes)['__routes'];
const _e2eAsTypedRouter: TypedRouter<E2ERouteMapFromRoutes> = _e2eRouter;
void _e2eAsTypedRouter;

// Plain Router backward compat — accepts any string
declare const _e2ePlainRouter: Router;
_e2ePlainRouter.navigate({ to: '/anything-goes' });

// ─── Phase 4: useParams<TPath> + useRouter<T> + InferRouteMap ────────────────

// useParams<TPath> returns ExtractParams<TPath>
const _e2eParams = useParams<'/tasks/:id'>();
const _e2eTaskId: string = _e2eParams.id;
void _e2eTaskId;

// @ts-expect-error - 'name' not on ExtractParams<'/tasks/:id'>
const _e2eBadParam = _e2eParams.name;
void _e2eBadParam;

// useRouter<InferRouteMap<typeof routes>> typed navigate
const _e2eTypedRouter = useRouter<InferRouteMap<typeof _e2eRoutes>>();

// Valid route patterns compile
_e2eTypedRouter.navigate({ to: '/' });
_e2eTypedRouter.navigate({ to: '/tasks/:id', params: { id: '42' } });
_e2eTypedRouter.navigate({
  to: '/users/:userId/posts/:postId',
  params: { postId: '99', userId: '1' },
});
_e2eTypedRouter.navigate({ to: '/settings' });
_e2eTypedRouter.navigate({ to: '/files/*', params: { '*': 'docs/readme.md' } });

// @ts-expect-error - invalid route pattern
_e2eTypedRouter.navigate({ to: '/nonexistent' });

// @ts-expect-error - partial param route is not defined
_e2eTypedRouter.navigate({ to: '/tasks' });

// @ts-expect-error - params required for dynamic route patterns
_e2eTypedRouter.navigate({ to: '/users/:userId/posts/:postId' });

// @ts-expect-error - params are not allowed for static routes
_e2eTypedRouter.navigate({ to: '/settings', params: { userId: '1' } });

// useRouter() (no param) backward compat — accepts any string
const _e2eUntypedRouter = useRouter();
_e2eUntypedRouter.navigate({ to: '/anything-goes' });

// InferRouteMap extracts route map correctly
type E2EInferred = InferRouteMap<typeof _e2eRoutes>;
type E2EInferredKeys = keyof E2EInferred;
const _e2eInfKey: E2EInferredKeys = '/tasks/:id';
void _e2eInfKey;

// @ts-expect-error - '/nonexistent' is not a key in the inferred route map
const _e2eBadInfKey: E2EInferredKeys = '/nonexistent';
void _e2eBadInfKey;

// ─── Phase 5: Typed Link ─────────────────────────────────────────────────────

import type { LinkProps } from '../link';

// Typed LinkProps validates href against route paths
type E2ERouteMapForLink = (typeof _e2eRoutes)['__routes'];
declare const _e2eTypedLink: (props: LinkProps<E2ERouteMapForLink>) => HTMLAnchorElement;

// Valid hrefs compile
_e2eTypedLink({ href: '/', children: 'Home' });
_e2eTypedLink({ href: '/tasks/42', children: 'Task' });
_e2eTypedLink({ href: '/users/1/posts/99', children: 'Post' });
_e2eTypedLink({ href: '/settings', children: 'Settings' });
_e2eTypedLink({ href: '/files/docs/readme.md', children: 'File' });

// @ts-expect-error - invalid path
_e2eTypedLink({ href: '/nonexistent', children: 'Bad' });

// @ts-expect-error - partial param path
_e2eTypedLink({ href: '/tasks', children: 'Bad' });

// Untyped LinkProps accepts any string href (backward compat)
declare const _e2eUntypedLink: (props: LinkProps) => HTMLAnchorElement;
_e2eUntypedLink({ href: '/anything-goes', children: 'OK' });
