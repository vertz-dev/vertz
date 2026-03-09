/**
 * Type definitions for Satori-compatible node trees and OG image options.
 *
 * Satori accepts React-element-like objects ({ type, props }) but we define
 * our own types to avoid depending on @types/react.
 */

/** CSS style properties supported by Satori (subset of React CSSProperties). */
export type SatoriStyle = Record<string, string | number | undefined>;

/** A Satori-compatible element node. */
export interface SatoriElement {
  type: string;
  props: {
    style?: SatoriStyle;
    children?: SatoriChild | SatoriChild[];
    src?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
}

/** A child node in a Satori tree: element, string, number, or null/undefined/boolean. */
export type SatoriChild = SatoriElement | string | number | boolean | null | undefined;

/** Font weight values supported by Satori. */
export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

/** Font style. */
export type FontStyle = 'normal' | 'italic';

/** Font configuration for OG image generation. */
export interface FontConfig {
  /** The font data as a Buffer or ArrayBuffer. */
  data: Buffer | ArrayBuffer;
  /** The font family name. */
  name: string;
  /** Font weight (100-900). */
  weight?: FontWeight;
  /** Font style. */
  style?: FontStyle;
  /** Language tag for the font. */
  lang?: string;
}

/** Options for generating an OG image. */
export interface OGImageOptions {
  /** Image width in pixels. Defaults to 1200. */
  width?: number;
  /** Image height in pixels. Defaults to 630. */
  height?: number;
  /** Font configurations. Required unless using templates with auto-loaded fonts. */
  fonts?: FontConfig[];
  /** Enable Satori debug mode (renders layout boxes). */
  debug?: boolean;
}
