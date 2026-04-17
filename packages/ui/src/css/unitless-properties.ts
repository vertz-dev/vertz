/**
 * CSS properties that accept unitless numeric values (no 'px' suffix).
 * Single source of truth — mirrored in
 * `native/vertz-compiler-core/src/css_unitless.rs` (parity enforced by
 * `packages/ui/scripts/check-unitless-parity.ts`).
 *
 * Matches React's behavior — see react-dom/src/shared/CSSProperty.js.
 * Keys are camelCase.
 */
export const UNITLESS_PROPERTIES: ReadonlySet<string> = new Set([
  'animationIterationCount',
  'aspectRatio',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'boxOrdinalGroup',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexPositive',
  'flexShrink',
  'flexNegative',
  'flexOrder',
  'gridArea',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'fontWeight',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth',
  'scale',
]);

export function isUnitless(camelProperty: string): boolean {
  return UNITLESS_PROPERTIES.has(camelProperty);
}
