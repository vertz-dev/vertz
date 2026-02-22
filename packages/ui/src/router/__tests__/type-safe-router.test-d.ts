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

// Phase 1: these imports exist
import type { PathWithParams, RoutePaths } from '../params';

// Phase 2+: these don't exist yet — will cause compile errors
// TODO(phase-2): import type { TypedRoutes } from '../define-routes';
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

// ─── Phase 2+ tests (commented out until types exist) ───────────────────────

// The following tests will be uncommented as each phase is implemented.
// They are left here as the specification of what must compile when done.

// Phase 2: defineRoutes<const T>() preserves literal keys
// Phase 3: createRouter returns TypedRouter, navigate validates paths
// Phase 4: useParams<TPath> returns ExtractParams<TPath>
// Phase 4: useRouter<InferRouteMap<typeof routes>> typed navigate
// Phase 3: TypedRouter assignable to Router, backward compat
//
// These tests will be uncommented as each phase is implemented.
// See plans/type-safe-router-impl.md → E2E Acceptance Test for full spec.
