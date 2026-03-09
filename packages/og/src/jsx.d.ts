/**
 * JSX type declarations for Satori elements.
 *
 * Allows .tsx files in this package to use JSX syntax that produces
 * SatoriElement objects via the `h` factory function.
 */

import type { SatoriChild, SatoriElement, SatoriStyle } from './types';

declare global {
  namespace JSX {
    type Element = SatoriElement;

    interface IntrinsicElements {
      [tag: string]: {
        style?: SatoriStyle;
        children?: SatoriChild | SatoriChild[];
        src?: string;
        width?: number;
        height?: number;
        [key: string]: unknown;
      };
    }
  }
}
