/** A single child value: DOM node, string, number, null, undefined, or nested array. */
export type ChildValue = Node | string | number | null | undefined | ChildValue[];

/** A function that returns children (slot accessor). */
export type ChildrenAccessor = () => ChildValue;

/**
 * Resolve a raw child value into a flat array of DOM nodes.
 * Strings and numbers are converted to Text nodes.
 * Null and undefined are filtered out.
 * Arrays are flattened recursively.
 */
export function resolveChildren(value: ChildValue): Node[] {
  if (value == null) {
    return [];
  }
  if (typeof value === 'string') {
    return [document.createTextNode(value)];
  }
  if (typeof value === 'number') {
    return [document.createTextNode(String(value))];
  }
  if (Array.isArray(value)) {
    const result: Node[] = [];
    for (const child of value) {
      const resolved = resolveChildren(child);
      for (const node of resolved) {
        result.push(node);
      }
    }
    return result;
  }
  // It's a Node
  return [value];
}

/**
 * Create a children resolver from a children accessor.
 * Returns a function that, when called, resolves the children
 * to a flat array of DOM nodes.
 */
export function children(accessor: ChildrenAccessor): () => Node[] {
  return () => resolveChildren(accessor());
}
