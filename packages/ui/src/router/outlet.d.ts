/**
 * Outlet component for rendering nested route children.
 *
 * The Outlet renders the child route's component in a layout's slot.
 * It reads from a context that the router populates when rendering
 * nested routes.
 */
import { type Context } from '../component/context';
/** Context value for the Outlet. */
export interface OutletContext {
  /** The child component factory to render, or undefined if no child. */
  childComponent: (() => Node) | undefined;
  /** The nesting depth (for debugging/tracking). */
  depth: number;
}
/**
 * Create an Outlet component bound to a specific outlet context.
 *
 * @param outletCtx - The context that holds the child component
 * @returns An Outlet component function
 */
export declare function createOutlet(outletCtx: Context<OutletContext>): () => Node;
//# sourceMappingURL=outlet.d.ts.map
