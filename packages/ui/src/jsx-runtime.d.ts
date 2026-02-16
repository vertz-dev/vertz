/**
 * JSX runtime for @vertz/ui — used by Bun at test/dev time.
 *
 * At build time, the @vertz/ui-compiler transforms JSX into optimized
 * __element() / __on() / __text() / __attr() calls with compile-time
 * reactivity analysis. This runtime provides a simpler DOM-based
 * implementation for tests and development.
 *
 * Implements the "react-jsx" automatic runtime interface:
 * - jsx(type, props)  — single child
 * - jsxs(type, props) — multiple children
 * - Fragment          — document fragment
 */
type Tag = string | ((props: Record<string, unknown>) => Node | Node[] | null);
/**
 * JSX factory function for client-side rendering.
 *
 * When tag is a function (component), calls it with props.
 * When tag is a string (HTML element), creates a DOM element.
 */
export declare function jsx(tag: Tag, props: Record<string, unknown>): Node | Node[] | null;
/**
 * JSX factory for elements with multiple children.
 * In the automatic runtime, this is used when there are multiple children.
 * For our implementation, it's the same as jsx().
 */
export declare const jsxs: typeof jsx;
/**
 * Fragment component — a DocumentFragment container for multiple children.
 */
export declare function Fragment(props: { children?: unknown }): DocumentFragment;
/**
 * JSX development mode factory (used with @jsxImportSource in tsconfig).
 * Same as jsx() for our implementation.
 */
export declare const jsxDEV: typeof jsx;
//# sourceMappingURL=jsx-runtime.d.ts.map
