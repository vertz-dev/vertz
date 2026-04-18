/**
 * Type-safe CSS property name unions.
 *
 * Provides compile-time validation for raw CSS declaration maps used in
 * css(), globalCss(), and keyframes(). Prevents typos like `{ hello: 'world' }`
 * while allowing standard properties, custom properties (--*), and vendor prefixes.
 */

/**
 * Union of standard CSS property names in kebab-case.
 *
 * Used by css() and keyframes() which accept kebab-case properties.
 * Not exhaustive — covers all commonly used properties. Vendor prefixes
 * and CSS custom properties are handled separately via `-${string}`.
 */
export type CSSPropertyName =
  // Layout & Display
  | 'display'
  | 'position'
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'inset'
  | 'float'
  | 'clear'
  | 'z-index'
  | 'overflow'
  | 'overflow-x'
  | 'overflow-y'
  | 'visibility'
  | 'box-sizing'
  | 'object-fit'
  | 'object-position'
  | 'aspect-ratio'
  | 'isolation'
  | 'contain'
  | 'content-visibility'
  | 'container'
  | 'container-type'
  | 'container-name'

  // Flexbox
  | 'flex'
  | 'flex-direction'
  | 'flex-wrap'
  | 'flex-flow'
  | 'flex-grow'
  | 'flex-shrink'
  | 'flex-basis'
  | 'order'
  | 'justify-content'
  | 'justify-items'
  | 'justify-self'
  | 'align-items'
  | 'align-self'
  | 'align-content'
  | 'gap'
  | 'row-gap'
  | 'column-gap'
  | 'place-content'
  | 'place-items'
  | 'place-self'

  // Grid
  | 'grid'
  | 'grid-template'
  | 'grid-template-columns'
  | 'grid-template-rows'
  | 'grid-template-areas'
  | 'grid-auto-columns'
  | 'grid-auto-rows'
  | 'grid-auto-flow'
  | 'grid-column'
  | 'grid-column-start'
  | 'grid-column-end'
  | 'grid-row'
  | 'grid-row-start'
  | 'grid-row-end'
  | 'grid-area'

  // Box Model — Sizing
  | 'width'
  | 'height'
  | 'min-width'
  | 'max-width'
  | 'min-height'
  | 'max-height'

  // Box Model — Padding
  | 'padding'
  | 'padding-top'
  | 'padding-right'
  | 'padding-bottom'
  | 'padding-left'

  // Box Model — Margin
  | 'margin'
  | 'margin-top'
  | 'margin-right'
  | 'margin-bottom'
  | 'margin-left'

  // Box Model — Border
  | 'border'
  | 'border-width'
  | 'border-style'
  | 'border-color'
  | 'border-top'
  | 'border-right'
  | 'border-bottom'
  | 'border-left'
  | 'border-top-width'
  | 'border-right-width'
  | 'border-bottom-width'
  | 'border-left-width'
  | 'border-top-style'
  | 'border-right-style'
  | 'border-bottom-style'
  | 'border-left-style'
  | 'border-top-color'
  | 'border-right-color'
  | 'border-bottom-color'
  | 'border-left-color'
  | 'border-radius'
  | 'border-top-left-radius'
  | 'border-top-right-radius'
  | 'border-bottom-left-radius'
  | 'border-bottom-right-radius'
  | 'border-collapse'
  | 'border-spacing'
  | 'border-image'

  // Box Model — Outline & Shadow
  | 'outline'
  | 'outline-width'
  | 'outline-style'
  | 'outline-color'
  | 'outline-offset'
  | 'box-shadow'

  // Typography
  | 'font'
  | 'font-family'
  | 'font-size'
  | 'font-weight'
  | 'font-style'
  | 'font-variant'
  | 'font-stretch'
  | 'font-feature-settings'
  | 'font-variation-settings'
  | 'font-optical-sizing'
  | 'line-height'
  | 'letter-spacing'
  | 'text-align'
  | 'text-align-last'
  | 'text-decoration'
  | 'text-decoration-line'
  | 'text-decoration-color'
  | 'text-decoration-style'
  | 'text-decoration-thickness'
  | 'text-underline-offset'
  | 'text-rendering'
  | 'text-transform'
  | 'text-indent'
  | 'text-overflow'
  | 'text-shadow'
  | 'text-wrap'
  | 'text-wrap-mode'
  | 'text-wrap-style'
  | 'white-space'
  | 'word-break'
  | 'word-spacing'
  | 'word-wrap'
  | 'overflow-wrap'
  | 'hyphens'
  | 'vertical-align'
  | 'direction'
  | 'unicode-bidi'
  | 'writing-mode'
  | 'tab-size'

  // Color & Background
  | 'color'
  | 'opacity'
  | 'background'
  | 'background-color'
  | 'background-image'
  | 'background-size'
  | 'background-position'
  | 'background-repeat'
  | 'background-attachment'
  | 'background-clip'
  | 'background-origin'
  | 'background-blend-mode'
  | 'mix-blend-mode'

  // Effects & Filters
  | 'filter'
  | 'backdrop-filter'
  | 'clip-path'
  | 'clip'
  | 'mask'
  | 'mask-image'
  | 'mask-size'
  | 'mask-position'
  | 'mask-repeat'

  // Transform
  | 'transform'
  | 'transform-origin'
  | 'transform-style'
  | 'perspective'
  | 'perspective-origin'
  | 'rotate'
  | 'scale'
  | 'translate'

  // Transition & Animation
  | 'transition'
  | 'transition-property'
  | 'transition-duration'
  | 'transition-timing-function'
  | 'transition-delay'
  | 'transition-behavior'
  | 'animation'
  | 'animation-name'
  | 'animation-duration'
  | 'animation-timing-function'
  | 'animation-delay'
  | 'animation-iteration-count'
  | 'animation-direction'
  | 'animation-fill-mode'
  | 'animation-play-state'
  | 'animation-timeline'
  | 'animation-composition'

  // Interaction
  | 'cursor'
  | 'pointer-events'
  | 'user-select'
  | 'resize'
  | 'touch-action'
  | 'field-sizing'
  | 'scroll-behavior'
  | 'scroll-margin'
  | 'scroll-margin-top'
  | 'scroll-margin-right'
  | 'scroll-margin-bottom'
  | 'scroll-margin-left'
  | 'scroll-padding'
  | 'scroll-padding-top'
  | 'scroll-padding-right'
  | 'scroll-padding-bottom'
  | 'scroll-padding-left'
  | 'scroll-snap-type'
  | 'scroll-snap-align'
  | 'scroll-snap-stop'
  | 'overscroll-behavior'
  | 'overscroll-behavior-x'
  | 'overscroll-behavior-y'
  | 'scrollbar-width'
  | 'scrollbar-color'
  | 'scrollbar-gutter'

  // Lists & Tables
  | 'list-style'
  | 'list-style-type'
  | 'list-style-position'
  | 'list-style-image'
  | 'table-layout'
  | 'caption-side'
  | 'empty-cells'
  | 'counter-reset'
  | 'counter-increment'
  | 'counter-set'
  | 'content'

  // Appearance & Miscellaneous
  | 'appearance'
  | 'will-change'
  | 'accent-color'
  | 'caret-color'
  | 'color-scheme'
  | 'forced-color-adjust'
  | 'print-color-adjust'

  // SVG
  | 'fill'
  | 'stroke'
  | 'stroke-width'
  | 'stroke-dasharray'
  | 'stroke-dashoffset'
  | 'stroke-linecap'
  | 'stroke-linejoin'

  // Columns
  | 'columns'
  | 'column-count'
  | 'column-width'
  | 'column-rule'
  | 'column-rule-width'
  | 'column-rule-style'
  | 'column-rule-color'
  | 'column-span'
  | 'column-fill'

  // View Transitions
  | 'view-transition-name'

  // Logical Properties
  | 'block-size'
  | 'inline-size'
  | 'min-block-size'
  | 'min-inline-size'
  | 'max-block-size'
  | 'max-inline-size'
  | 'padding-block'
  | 'padding-block-start'
  | 'padding-block-end'
  | 'padding-inline'
  | 'padding-inline-start'
  | 'padding-inline-end'
  | 'margin-block'
  | 'margin-block-start'
  | 'margin-block-end'
  | 'margin-inline'
  | 'margin-inline-start'
  | 'margin-inline-end'
  | 'border-block'
  | 'border-block-start'
  | 'border-block-end'
  | 'border-inline'
  | 'border-inline-start'
  | 'border-inline-end'
  | 'inset-block'
  | 'inset-block-start'
  | 'inset-block-end'
  | 'inset-inline'
  | 'inset-inline-start'
  | 'inset-inline-end';

/**
 * Type-safe CSS declarations map (kebab-case keys).
 *
 * Accepts standard CSS properties, CSS custom properties (--*),
 * and vendor prefixes (-webkit-*, -moz-*, -ms-*).
 * Rejects arbitrary keys like `{ hello: 'world' }`.
 */
export type CSSDeclarations = {
  [K in CSSPropertyName | `-${string}`]?: string;
};

/** Convert kebab-case string to camelCase at the type level. */
type KebabToCamel<S extends string> = S extends `${infer P}-${infer R}`
  ? `${P}${Capitalize<KebabToCamel<R>>}`
  : S;

/** CSSPropertyName in camelCase (derived from kebab-case source of truth). */
export type CamelCSSPropertyName = KebabToCamel<CSSPropertyName>;

/**
 * Type-safe CSS declarations map (camelCase keys).
 *
 * Used by globalCss() which accepts camelCase property names.
 * CSS custom properties (--*) use kebab-case. Vendor prefixes use
 * camelCase with a capitalized prefix (WebkitTransform, MozAppearance, etc.).
 */
export type CamelCSSDeclarations = {
  [K in
    | CamelCSSPropertyName
    | `-${string}`
    | `Webkit${string}`
    | `Moz${string}`
    | `Ms${string}`]?: string;
};
