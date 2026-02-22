/**
 * Developer Walkthrough — Type-Safe Router
 *
 * This test uses public package imports (@vertz/ui) to validate
 * cross-package type safety. It catches issues that per-package
 * typechecks miss: bundler-inlined symbols, .d.ts generation
 * problems, and variance mismatches.
 *
 * Created in Phase 1 as a failing (RED) stub. Activated in Phase 6
 * when all types are exported from the public API.
 *
 * @see plans/type-safe-router.md (design doc)
 * @see plans/type-safe-router-impl.md (implementation plan)
 * @see .claude/rules/public-api-validation.md
 */

import type { InferRouteMap, LinkProps, PathWithParams, Router, RoutePaths } from '@vertz/ui';

// Verify RoutePaths produces the expected union
type AppPaths = RoutePaths<{
  '/': { component: () => HTMLElement };
  '/tasks/:id': { component: () => HTMLElement };
}>;
const _rpStatic: AppPaths = '/';
const _rpParam: AppPaths = '/tasks/42';
void _rpStatic;
void _rpParam;
import { createRouter, defineRoutes, useParams, useRouter } from '@vertz/ui';

// ─── Phase 1: PathWithParams + RoutePaths ─────────────────────────────────────

const _pwp: PathWithParams<'/tasks/:id'> = '/tasks/42';
void _pwp;

// ─── Phase 2: defineRoutes preserves literal keys ─────────────────────────────

const routes = defineRoutes({
  '/': { component: () => document.createElement('div') },
  '/tasks/:id': { component: () => document.createElement('div') },
  '/users/:userId/posts/:postId': { component: () => document.createElement('div') },
  '/settings': { component: () => document.createElement('div') },
  '/files/*': { component: () => document.createElement('div') },
});

// ─── Phase 3: createRouter<T> with typed navigate ─────────────────────────────

const router = createRouter(routes);

// Valid paths
router.navigate('/');
router.navigate('/tasks/42');
router.navigate('/users/1/posts/99');
router.navigate('/settings');
router.navigate('/files/docs/readme.md');

// @ts-expect-error - invalid path
router.navigate('/nonexistent');

// ─── Phase 4: useParams + useRouter<InferRouteMap> ────────────────────────────

// useParams typed
const params = useParams<'/tasks/:id'>();
const _id: string = params.id;
void _id;

// @ts-expect-error - 'name' not on ExtractParams<'/tasks/:id'>
const _badParam = params.name;
void _badParam;

// useRouter with InferRouteMap
const typedRouter = useRouter<InferRouteMap<typeof routes>>();
typedRouter.navigate('/tasks/42');

// @ts-expect-error - invalid path via InferRouteMap
typedRouter.navigate('/nonexistent');

// TypedRouter assignable to Router (backward compat)
const _asRouter: Router = router;
void _asRouter;

// Backward compat — untyped Router accepts any string
declare const untypedRouter: Router;
untypedRouter.navigate('/anything');

// ─── Phase 5: Typed LinkProps ─────────────────────────────────────────────────

type AppRouteMap = InferRouteMap<typeof routes>;
declare const typedLink: (props: LinkProps<AppRouteMap>) => HTMLAnchorElement;

// Valid hrefs
typedLink({ href: '/', children: 'Home' });
typedLink({ href: '/tasks/42', children: 'Task' });
typedLink({ href: '/settings', children: 'Settings' });

// @ts-expect-error - invalid href
typedLink({ href: '/nonexistent', children: 'Bad' });

// Untyped LinkProps backward compat
declare const untypedLink: (props: LinkProps) => HTMLAnchorElement;
untypedLink({ href: '/anything-goes', children: 'OK' });
