/**
 * Core OG image generation.
 *
 * Renders a Satori-compatible element tree to a PNG image
 * using Satori (element → SVG) and resvg (SVG → PNG).
 */

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { OGImageOptions, SatoriElement } from './types';

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;

/**
 * Satori types expect ReactNode but structurally accept { type, props } objects.
 * We re-type the import to avoid a double-cast at every call site.
 */
const satoriRender = satori as (
  element: { type: string; props: Record<string, unknown> },
  options: Parameters<typeof satori>[1],
) => Promise<string>;

/**
 * Generate an OG image from a Satori-compatible element tree.
 *
 * @param element - A Satori-compatible element tree (object with `type` and `props`).
 * @param options - Image generation options (dimensions, fonts, debug mode).
 * @returns A PNG image as a Uint8Array.
 */
export async function generateOGImage(
  element: SatoriElement,
  options: OGImageOptions = {},
): Promise<Uint8Array> {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const fonts = options.fonts ?? [];

  if (fonts.length === 0) {
    throw new Error(
      'generateOGImage requires at least one font. Use loadGoogleFont() to load fonts.',
    );
  }

  const svg = await satoriRender(element, {
    width,
    height,
    fonts,
    debug: options.debug,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });

  return resvg.render().asPng();
}
