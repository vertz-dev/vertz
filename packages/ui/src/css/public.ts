/**
 * @vertz/ui/css — Public subpath barrel.
 *
 * Only the curated public API is exported here.
 * Internal symbols (generateClassName, parseShorthand,
 * ShorthandParseError, InlineStyleError, isKnownProperty, isValidColorToken,
 * resolveToken, TokenResolveError) live in @vertz/ui/internals or the
 * internal barrel (./index.ts).
 */

export type { CSSInput, CSSOutput, StyleEntry, StyleValue } from './css';
export { css } from './css';
export type { SelectorKey, StyleBlock, StyleDeclarations } from './style-block';
export type {
  CamelCSSDeclarations,
  CamelCSSPropertyName,
  CSSDeclarations,
  CSSPropertyName,
} from './css-properties';
export type {
  CompiledFonts,
  CompileFontsOptions,
  FallbackFontName,
  FontDescriptor,
  FontFallbackMetrics,
  GoogleFontMeta,
  FontOptions,
  FontSrc,
  PreloadItem,
} from './font';
export { compileFonts, font } from './font';
export type { GoogleFontOptions } from './google-font';
export { googleFont } from './google-font';
export type { GlobalCSSInput, GlobalCSSOutput } from './global-css';
export { globalCss } from './global-css';
export { s } from './s';
export type { CompiledTheme, CompileThemeOptions, Theme, ThemeInput } from './theme';
export { compileTheme, defineTheme } from './theme';
export type {
  TokenPath,
  VertzThemeColors,
  VertzThemeFonts,
  VertzThemeSpacing,
  VertzThemeTokens,
} from './token';
export { token } from './token';
export type { ThemeProviderProps } from './theme-provider';
export { ThemeProvider } from './theme-provider';
export type { UtilityClass } from './utility-types';
export type { VariantFunction, VariantProps, VariantsConfig } from './variants';
export { variants } from './variants';
