/**
 * @vertz/ui/css — Public subpath barrel.
 *
 * Only the curated public API is exported here.
 * Internal symbols (generateClassName, parseShorthand,
 * ShorthandParseError, InlineStyleError, isKnownProperty, isValidColorToken,
 * resolveToken, TokenResolveError) live in @vertz/ui/internals or the
 * internal barrel (./index.ts).
 */
export type { CSSInput, CSSOutput, StyleEntry } from './css';
export { css } from './css';
export type { GlobalCSSInput, GlobalCSSOutput } from './global-css';
export { globalCss } from './global-css';
export { s } from './s';
export type { CompiledTheme, Theme, ThemeInput } from './theme';
export { compileTheme, defineTheme } from './theme';
export type { ThemeProviderProps } from './theme-provider';
export { ThemeProvider } from './theme-provider';
export type { VariantFunction, VariantProps, VariantsConfig } from './variants';
export { variants } from './variants';
//# sourceMappingURL=public.d.ts.map
