/**
 * SVG namespace detection and attribute normalization.
 *
 * SVG elements must be created with `createElementNS` using the SVG namespace,
 * otherwise the browser treats them as unknown HTML elements and they don't render.
 *
 * SVG attributes in JSX use camelCase but the actual XML attributes use hyphenated
 * names. The SVG_ATTR_MAP handles this translation.
 */

export const SVG_TAGS: Set<string> = new Set([
  'svg',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'g',
  'defs',
  'symbol',
  'use',
  'text',
  'tspan',
  'image',
  'foreignObject',
  'filter',
  'feGaussianBlur',
  'feOffset',
  'feColorMatrix',
  'feBlend',
  'feMerge',
  'feMergeNode',
  'feComposite',
  'feFlood',
  'linearGradient',
  'radialGradient',
  'stop',
  'pattern',
  'clipPath',
  'mask',
  'animate',
  'animateTransform',
  'set',
  'marker',
  'desc',
]);

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function isSVGTag(tag: string): boolean {
  return SVG_TAGS.has(tag);
}

export const SVG_ATTR_MAP: Record<string, string> = {
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeOpacity: 'stroke-opacity',
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  clipRule: 'clip-rule',
  clipPath: 'clip-path',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  floodColor: 'flood-color',
  floodOpacity: 'flood-opacity',
  colorInterpolation: 'color-interpolation',
  colorInterpolationFilters: 'color-interpolation-filters',
  viewBox: 'viewBox',
};

/**
 * Normalize an SVG attribute name from camelCase to hyphenated.
 * Returns the original name if no mapping exists.
 */
export function normalizeSVGAttr(attr: string): string {
  return SVG_ATTR_MAP[attr] ?? attr;
}
