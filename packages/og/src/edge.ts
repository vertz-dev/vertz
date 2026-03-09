/**
 * Edge entry point for @vertz/og.
 *
 * Re-exports all public APIs from the main package.
 * In a future iteration, this will swap the resvg backend
 * to @resvg/resvg-wasm for edge runtime compatibility.
 */

export { loadGoogleFont } from './fonts';
export { generateOGImage } from './generate';
export { loadImage } from './image';
export type { OGResponseOptions } from './og-response';
export { OGResponse } from './og-response';
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
