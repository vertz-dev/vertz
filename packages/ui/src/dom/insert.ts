/**
 * Insert a node into a container before a reference node.
 * If reference is null, appends to the end.
 */
export function insertBefore(container: Node, node: Node, reference: Node | null): void {
  container.insertBefore(node, reference);
}

/**
 * Remove a node from its parent.
 */
export function removeNode(node: Node): void {
  node.parentNode?.removeChild(node);
}

/**
 * Clear all children from a container.
 */
export function clearChildren(container: Node): void {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}
