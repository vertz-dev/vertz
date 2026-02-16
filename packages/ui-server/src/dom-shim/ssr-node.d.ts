/**
 * Base Node class for SSR — matches the browser's Node interface minimally
 */
export declare class SSRNode {
  childNodes: SSRNode[];
  parentNode: SSRNode | null;
  get firstChild(): SSRNode | null;
  get nextSibling(): SSRNode | null;
  removeChild(child: SSRNode): SSRNode;
  insertBefore(newNode: SSRNode, referenceNode: SSRNode | null): SSRNode;
  replaceChild(newNode: SSRNode, oldNode: SSRNode): SSRNode;
}
//# sourceMappingURL=ssr-node.d.ts.map
