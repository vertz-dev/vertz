/**
 * Outlet component for rendering nested route children.
 *
 * The Outlet renders the child route's component in a layout's slot.
 * It reads from a context that the router populates when rendering
 * nested routes.
 */
import { useContext } from '../component/context';
/**
 * Create an Outlet component bound to a specific outlet context.
 *
 * @param outletCtx - The context that holds the child component
 * @returns An Outlet component function
 */
export function createOutlet(outletCtx) {
  return function Outlet() {
    const ctx = useContext(outletCtx);
    if (!ctx || !ctx.childComponent) {
      return document.createComment('outlet:empty');
    }
    return ctx.childComponent();
  };
}
//# sourceMappingURL=outlet.js.map
