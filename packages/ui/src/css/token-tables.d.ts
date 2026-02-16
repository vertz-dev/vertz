/**
 * Shared CSS token lookup tables.
 *
 * This is the single source of truth for all CSS token resolution data.
 * These tables are consumed by:
 *   1. packages/ui/src/css/token-resolver.ts (runtime)
 *   2. packages/ui-compiler/src/transformers/css-transformer.ts (compiler)
 *   3. packages/ui-compiler/src/css-extraction/extractor.ts (extraction)
 *
 * DO NOT duplicate these tables elsewhere. If you need a new token,
 * add it here and all consumers will pick it up automatically.
 */
export interface PropertyMapping {
  /** CSS property name(s). If multiple, all get the same value. */
  properties: string[];
  /** Value resolver type. */
  valueType:
    | 'spacing'
    | 'color'
    | 'radius'
    | 'shadow'
    | 'size'
    | 'display'
    | 'alignment'
    | 'font-size'
    | 'font-weight'
    | 'line-height'
    | 'ring'
    | 'content'
    | 'raw';
}
export declare const PROPERTY_MAP: Record<string, PropertyMapping>;
/** A single CSS property-value pair. */
export interface CSSDeclarationEntry {
  property: string;
  value: string;
}
/** Keyword map -- single keywords that resolve to one or more declarations. */
export declare const KEYWORD_MAP: Record<string, CSSDeclarationEntry[]>;
/**
 * Display-only keyword map. Used by the compiler for quick display keyword
 * lookup without processing the full KEYWORD_MAP.
 */
export declare const DISPLAY_MAP: Record<string, string>;
/** Spacing scale: number -> rem. 1=0.25rem, 2=0.5rem, 4=1rem, 8=2rem, etc. */
export declare const SPACING_SCALE: Record<string, string>;
/** Border radius scale. */
export declare const RADIUS_SCALE: Record<string, string>;
/** Shadow scale. */
export declare const SHADOW_SCALE: Record<string, string>;
/** Font size scale. */
export declare const FONT_SIZE_SCALE: Record<string, string>;
/** Font weight scale. */
export declare const FONT_WEIGHT_SCALE: Record<string, string>;
/** Line height scale. */
export declare const LINE_HEIGHT_SCALE: Record<string, string>;
/** Alignment value map. */
export declare const ALIGNMENT_MAP: Record<string, string>;
/** Size keywords for width/height. */
export declare const SIZE_KEYWORDS: Record<string, string>;
/** Height-axis property shorthands that should use vh units. */
export declare const HEIGHT_AXIS_PROPERTIES: ReadonlySet<string>;
/** Known color token namespaces -- values that resolve to CSS custom properties. */
export declare const COLOR_NAMESPACES: ReadonlySet<string>;
/** CSS color keywords that pass through without token resolution. */
export declare const CSS_COLOR_KEYWORDS: ReadonlySet<string>;
/** Content keywords. */
export declare const CONTENT_MAP: Record<string, string>;
/** Supported pseudo-state prefixes. */
export declare const PSEUDO_PREFIXES: ReadonlySet<string>;
/** Map pseudo shorthand names to CSS pseudo-selectors. */
export declare const PSEUDO_MAP: Record<string, string>;
//# sourceMappingURL=token-tables.d.ts.map
