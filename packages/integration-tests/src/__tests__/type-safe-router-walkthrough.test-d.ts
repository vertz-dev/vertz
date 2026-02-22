/**
 * Developer Walkthrough — Type-Safe Router
 *
 * This test uses public package imports (@vertz/ui) to validate
 * cross-package type safety. It catches issues that per-package
 * typechecks miss: bundler-inlined symbols, .d.ts generation
 * problems, and variance mismatches.
 *
 * Created in Phase 1 as a failing (RED) stub. Passes after Phase 6
 * when all types are exported from the public API.
 *
 * @see plans/type-safe-router.md (design doc)
 * @see plans/type-safe-router-impl.md (implementation plan)
 * @see .claude/rules/public-api-validation.md
 */

// Phase 1: These types are implemented but NOT yet exported from @vertz/ui.
// This file will fail to typecheck until Phase 6 adds the public exports.
//
// Once exported, uncomment and validate:
//
// import type { PathWithParams, RoutePaths, InferRouteMap, Router } from '@vertz/ui';
// import { createRouter, defineRoutes, useParams, useRouter } from '@vertz/ui';
//
// const routes = defineRoutes({
//   '/': { component: () => document.createElement('div') },
//   '/tasks/:id': { component: () => document.createElement('div') },
//   '/users/:userId/posts/:postId': { component: () => document.createElement('div') },
//   '/settings': { component: () => document.createElement('div') },
//   '/files/*': { component: () => document.createElement('div') },
// });
//
// const router = createRouter(routes);
//
// // Valid paths
// router.navigate('/');
// router.navigate('/tasks/42');
// router.navigate('/users/1/posts/99');
// router.navigate('/settings');
// router.navigate('/files/docs/readme.md');
//
// // Invalid paths rejected
// // @ts-expect-error - invalid path
// // router.navigate('/nonexistent');
//
// // useParams typed
// const params = useParams<'/tasks/:id'>();
// const _id: string = params.id;
//
// // useRouter with InferRouteMap
// const typedRouter = useRouter<InferRouteMap<typeof routes>>();
// typedRouter.navigate('/tasks/42');
//
// // TypedRouter assignable to Router
// const _asRouter: Router = router;
//
// // Backward compat
// declare const untypedRouter: Router;
// untypedRouter.navigate('/anything');

// Placeholder to make the file valid TypeScript (empty export)
export {};
