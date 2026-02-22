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
import type { CompiledRoute, TypedRoutes } from '../define-routes';
import { defineRoutes } from '../define-routes';
// Phase 1: these imports exist
import type { PathWithParams, RoutePaths } from '../params';

// TODO(phase-3): import type { TypedRouter } from '../navigate';
// TODO(phase-4): import type { InferRouteMap } from '../define-routes';

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

// ─── Phase 3+ tests (commented out until types exist) ───────────────────────

// The following tests will be uncommented as each phase is implemented.
// They are left here as the specification of what must compile when done.
// Phase 3: createRouter returns TypedRouter, navigate validates paths
// Phase 3: TypedRouter assignable to Router, backward compat
// Phase 4: useParams<TPath> returns ExtractParams<TPath>
// Phase 4: useRouter<InferRouteMap<typeof routes>> typed navigate
//
// These tests will be uncommented as each phase is implemented.
// See plans/type-safe-router-impl.md → E2E Acceptance Test for full spec.
