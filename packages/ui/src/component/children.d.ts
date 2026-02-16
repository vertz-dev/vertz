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
export declare function resolveChildren(value: ChildValue): Node[];
/**
 * Create a children resolver from a children accessor.
 * Returns a function that, when called, resolves the children
 * to a flat array of DOM nodes.
 */
export declare function children(accessor: ChildrenAccessor): () => Node[];
//# sourceMappingURL=children.d.ts.map
