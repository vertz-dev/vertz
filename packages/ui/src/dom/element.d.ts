import type { DisposeFn } from '../runtime/signal-types';
/** A Text node that also carries a dispose function for cleanup. */
export interface DisposableText extends Text {
  dispose: DisposeFn;
}
/**
 * Create a reactive text node whose content updates automatically
 * when the reactive dependencies of `fn` change.
 *
 * This is a compiler output target — the compiler generates calls
 * to __text when it encounters reactive text interpolation in JSX.
 *
 * Returns a Text node with a `dispose` property for cleanup.
 */
export declare function __text(fn: () => string): DisposableText;
/**
 * Create a reactive child node that updates when dependencies change.
 * Unlike __text(), this handles both Node values (appended directly)
 * and primitives (converted to text nodes).
 *
 * This prevents HTMLElements from being stringified to "[object HTMLElement]"
 * when used as JSX expression children like {someElement}.
 *
 * Returns a wrapper element with `display: contents` and a `dispose` property.
 */
export declare function __child(
  fn: () => Node | string | number | boolean | null | undefined,
): HTMLElement & {
  dispose: DisposeFn;
};
/**
 * Insert a static (non-reactive) child value into a parent node.
 * This is used for static JSX expression children to avoid the performance
 * overhead of effect() when reactivity isn't needed.
 *
 * Handles Node values (appended directly), primitives (converted to text),
 * and nullish/boolean values (skipped).
 */
export declare function __insert(
  parent: Node,
  value: Node | string | number | boolean | null | undefined,
): void;
/**
 * Create a DOM element with optional static properties.
 *
 * This is a compiler output target — the compiler generates calls
 * to __element for each JSX element.
 */
export declare function __element(tag: string, props?: Record<string, string>): HTMLElement;
//# sourceMappingURL=element.d.ts.map
