import { listTransition } from '../dom/list-transition';
import { _tryOnCleanup } from '../runtime/disposal';

/**
 * @deprecated Use `<List animate>` from `@vertz/ui-primitives` instead.
 * `<List animate>` provides the same enter/exit animations with FLIP reorder support,
 * while preserving VertzQL field selection via `.map()` children.
 */
export interface ListTransitionProps<T> {
  each: T[];
  keyFn: (item: T, index: number) => string | number;
  children: (item: T) => Node;
}

/**
 * ListTransition component for animated list item enter/exit.
 * New items get `data-presence="enter"`, removed items get `data-presence="exit"`
 * with DOM removal deferred until CSS animation completes.
 *
 * Props are accessed as getters (not destructured) so the compiler-generated
 * reactive getters are tracked by the underlying domEffect.
 *
 * @deprecated Use `<List animate>` from `@vertz/ui-primitives` instead.
 * `<List animate>` provides the same enter/exit animations with FLIP reorder
 * support, while preserving VertzQL field selection via `.map()` children.
 */
export function ListTransition<T>(props: ListTransitionProps<T>): DocumentFragment {
  const startMarker = document.createComment('lt-start');
  const endMarker = document.createComment('lt-end');
  const fragment = document.createDocumentFragment();
  fragment.appendChild(startMarker);
  fragment.appendChild(endMarker);

  const dispose = listTransition(
    startMarker,
    endMarker,
    () => props.each,
    props.keyFn,
    props.children,
  );

  _tryOnCleanup(dispose);

  return Object.assign(fragment, { dispose });
}
