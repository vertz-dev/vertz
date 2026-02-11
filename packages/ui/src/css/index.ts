// Internal utilities — exported for compiler use
export { generateClassName } from './class-generator';
export type { CSSInput, CSSOutput, StyleEntry } from './css';
export { css } from './css';
export type { GlobalCSSInput, GlobalCSSOutput } from './global-css';
export { globalCss } from './global-css';
export { InlineStyleError, s } from './s';
export type { ParsedShorthand } from './shorthand-parser';
export { parseShorthand, ShorthandParseError } from './shorthand-parser';
export type { CSSDeclaration, ResolvedStyle } from './token-resolver';
export {
  isKnownProperty,
  isValidColorToken,
  resolveToken,
  TokenResolveError,
} from './token-resolver';
