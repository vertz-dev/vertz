/**
 * Insert a node into a container before a reference node.
 * If reference is null, appends to the end.
 */
export function insertBefore(container, node, reference) {
  container.insertBefore(node, reference);
}
/**
 * Remove a node from its parent.
 */
export function removeNode(node) {
  node.parentNode?.removeChild(node);
}
/**
 * Clear all children from a container.
 */
export function clearChildren(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}
//# sourceMappingURL=insert.js.map
