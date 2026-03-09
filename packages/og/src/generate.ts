/**
 * Core OG image generation.
 *
 * Renders a Satori-compatible element tree to a PNG image
 * using Satori (element → SVG) and resvg (SVG → PNG).
 */

import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import type { OGImageOptions, SatoriElement } from './types';

type SatoriInput = Parameters<typeof satori>[0];

/** Satori accepts plain { type, props } objects at runtime despite typing as ReactNode. */
function asSatoriInput(element: SatoriElement): SatoriInput {
  return element as unknown as SatoriInput;
}

const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 630;

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

  const svg = await satori(asSatoriInput(element), {
    width,
    height,
    fonts: options.fonts ?? [],
    debug: options.debug,
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
  });

  return resvg.render().asPng();
}
