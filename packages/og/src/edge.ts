/**
 * Edge entry point for @vertz/og.
 *
 * Exports only types, font loading, and templates — utilities that work
 * in edge runtimes. generateOGImage and createOGResponse are NOT exported here
 * because they depend on @resvg/resvg-js (Node-native addon).
 *
 * A future version will add edge-compatible generateOGImage using @resvg/resvg-wasm.
 */

export { loadGoogleFont } from './fonts';
export { loadImage } from './image';
export type { OGResponseOptions } from './og-response';
export type { CardProps, HeroProps, MinimalProps } from './templates';
export { OGTemplate } from './templates';
export type {
  FontConfig,
  FontStyle,
  FontWeight,
  OGImageOptions,
  SatoriChild,
  SatoriElement,
  SatoriStyle,
} from './types';
