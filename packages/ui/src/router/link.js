/**
 * Link component for client-side navigation.
 *
 * Creates `<a>` elements that intercept clicks for SPA navigation
 * and support active state styling.
 */
import { effect } from '../runtime/signal';
/**
 * Create a Link component factory bound to the router's state.
 *
 * @param currentPath - Reactive signal of the current URL path
 * @param navigate - Navigation function from the router
 * @returns A Link component function
 */
export function createLink(currentPath, navigate) {
  return function Link(props) {
    const el = document.createElement('a');
    el.setAttribute('href', props.href);
    el.textContent = props.children;
    if (props.className) {
      el.classList.add(props.className);
    }
    // Reactive active state — re-evaluates whenever currentPath changes
    if (props.activeClass) {
      const activeClass = props.activeClass;
      effect(() => {
        if (currentPath.value === props.href) {
          el.classList.add(activeClass);
        } else {
          el.classList.remove(activeClass);
        }
      });
    }
    // Intercept clicks for SPA navigation
    el.addEventListener('click', (event) => {
      // Allow modifier-key clicks to open in new tab
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      navigate(props.href);
    });
    return el;
  };
}
//# sourceMappingURL=link.js.map
