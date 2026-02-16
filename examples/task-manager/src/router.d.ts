/**
 * App router configuration.
 *
 * Demonstrates:
 * - defineRoutes() for route definition with loaders
 * - createRouter() for navigation state
 * - createLink() for client-side navigation
 * - createOutlet() for nested route rendering
 * - Route params extraction (task ID)
 */
import type { OutletContext, Router } from '@vertz/ui';
/**
 * Define the app routes.
 *
 * Each route has:
 * - component: a factory function returning the page element
 * - loader (optional): async data fetching that runs before render
 */
export declare const routes: import("@vertz/ui").CompiledRoute[];
export declare const appRouter: Router;
export declare const Link: (props: import("@vertz/ui").LinkProps) => HTMLAnchorElement;
/**
 * Create an Outlet context and component for nested route rendering.
 *
 * This is set up even though we're using flat routes in this demo,
 * to demonstrate the API for layout patterns.
 */
export declare const outletContext: import("@vertz/ui").Context<OutletContext>;
export declare const Outlet: () => Node;
//# sourceMappingURL=router.d.ts.map