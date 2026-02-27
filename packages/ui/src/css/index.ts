// Internal utilities — exported for compiler use
export { generateClassName } from './class-generator';
export type { CSSInput, CSSOutput, RawDeclaration, StyleEntry, StyleValue } from './css';
export { css, getInjectedCSS, resetInjectedStyles } from './css';
export type { GlobalCSSInput, GlobalCSSOutput } from './global-css';
export { globalCss } from './global-css';
export { type ColorPalette, palettes } from './palettes';
export { InlineStyleError, s } from './s';
export type { ParsedShorthand } from './shorthand-parser';
export { parseShorthand, ShorthandParseError } from './shorthand-parser';
export type {
  ColorTokens,
  CompiledTheme,
  SpacingTokens,
  Theme,
  ThemeInput,
  TokenValue,
} from './theme';
export { compileTheme, defineTheme } from './theme';
export type { ThemeChild, ThemeProviderProps } from './theme-provider';
export { ThemeProvider } from './theme-provider';
export type { CSSDeclaration, ResolvedStyle } from './token-resolver';
export {
  isKnownProperty,
  isValidColorToken,
  resolveToken,
  TokenResolveError,
} from './token-resolver';
// Shared token tables — single source of truth for all CSS token resolution
export type { CSSDeclarationEntry, PropertyMapping } from './token-tables';
export {
  ALIGNMENT_MAP,
  COLOR_NAMESPACES,
  CONTENT_MAP,
  CSS_COLOR_KEYWORDS,
  DISPLAY_MAP,
  FONT_SIZE_SCALE,
  FONT_WEIGHT_SCALE,
  HEIGHT_AXIS_PROPERTIES,
  KEYWORD_MAP,
  LINE_HEIGHT_SCALE,
  PROPERTY_MAP,
  PSEUDO_MAP,
  PSEUDO_PREFIXES,
  RADIUS_SCALE,
  SHADOW_SCALE,
  SIZE_KEYWORDS,
  SPACING_SCALE,
} from './token-tables';
export type { VariantFunction, VariantProps, VariantsConfig } from './variants';
export { variants } from './variants';
