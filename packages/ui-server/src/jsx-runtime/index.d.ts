/**
 * Server-side JSX runtime for SSR.
 *
 * Produces VNode trees compatible with @vertz/ui-server's renderToStream.
 * Used only during SSR; the client uses the DOM-based jsx-runtime.ts.
 *
 * This runtime is swapped in by Vite's ssrLoadModule during server-side
 * module transformation.
 */
import type { VNode } from '../types';
type JSXComponent = (props: Record<string, unknown>) => VNode | VNode[] | string | null;
type Tag = string | JSXComponent;
/**
 * JSX factory function for server-side rendering.
 *
 * When tag is a function (component), calls it with props.
 * When tag is a string (HTML element), creates a VNode.
 */
export declare function jsx(tag: Tag, props: Record<string, unknown>): VNode;
/**
 * JSX factory for elements with multiple children.
 * In the automatic runtime, this is used when there are multiple children.
 * For our implementation, it's the same as jsx().
 */
export declare const jsxs: typeof jsx;
/**
 * JSX development mode factory (used with @jsxImportSource in tsconfig).
 * Same as jsx() for our implementation.
 */
export declare const jsxDEV: typeof jsx;
/**
 * Fragment component — a virtual container for multiple children.
 * The @vertz/ui-server renderer will unwrap fragments during serialization.
 */
export declare function Fragment(props: { children?: unknown }): VNode;
//# sourceMappingURL=index.d.ts.map
