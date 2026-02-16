/**
 * Wrap a VNode with hydration markers for interactive components.
 *
 * Adds `data-v-id` and `data-v-key` attributes to the root element,
 * and optionally embeds serialized props as a `<script type="application/json">` child.
 *
 * Returns a new VNode; the original is not mutated.
 */
export function wrapWithHydrationMarkers(node, options) {
  const newAttrs = {
    ...node.attrs,
    'data-v-id': options.componentName,
    'data-v-key': options.key,
  };
  const newChildren = [...node.children];
  if (options.props !== undefined) {
    const propsScript = {
      tag: 'script',
      attrs: { type: 'application/json' },
      children: [JSON.stringify(options.props)],
    };
    newChildren.push(propsScript);
  }
  return {
    tag: node.tag,
    attrs: newAttrs,
    children: newChildren,
  };
}
//# sourceMappingURL=hydration-markers.js.map
