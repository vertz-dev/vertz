import type { HydrationOptions, VNode } from './types';
/**
 * Wrap a VNode with hydration markers for interactive components.
 *
 * Adds `data-v-id` and `data-v-key` attributes to the root element,
 * and optionally embeds serialized props as a `<script type="application/json">` child.
 *
 * Returns a new VNode; the original is not mutated.
 */
export declare function wrapWithHydrationMarkers(node: VNode, options: HydrationOptions): VNode;
//# sourceMappingURL=hydration-markers.d.ts.map
