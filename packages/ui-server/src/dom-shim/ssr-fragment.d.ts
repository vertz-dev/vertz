import type { SSRElement } from './ssr-element';
import { SSRNode } from './ssr-node';
import { SSRTextNode } from './ssr-text-node';
/**
 * SSR document fragment
 */
export declare class SSRDocumentFragment extends SSRNode {
  children: (SSRElement | string)[];
  appendChild(child: SSRElement | SSRTextNode | SSRDocumentFragment): void;
}
//# sourceMappingURL=ssr-fragment.d.ts.map
