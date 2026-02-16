/**
 * Minimal DOM shim for SSR.
 *
 * Provides document.createElement, .createTextNode, .appendChild, etc.
 * that produce VNode-compatible objects. This allows existing @vertz/ui
 * components to work in SSR without modification.
 *
 * IMPORTANT: This must be imported before any component code.
 */
import type { VNode } from '../types';
import { SSRElement } from './ssr-element';
import { SSRDocumentFragment } from './ssr-fragment';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';
export { SSRNode, SSRElement, SSRTextNode, SSRDocumentFragment };
/**
 * Create and install the DOM shim
 */
export declare function installDomShim(): void;
/**
 * Remove the DOM shim
 */
export declare function removeDomShim(): void;
/**
 * Convert an SSRElement to a VNode
 */
export declare function toVNode(element: any): VNode;
//# sourceMappingURL=index.d.ts.map
