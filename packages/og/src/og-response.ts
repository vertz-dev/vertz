/**
 * OG image HTTP response helper.
 *
 * Generates a PNG from a Satori element and wraps it in a Response
 * with appropriate headers (Content-Type, Cache-Control).
 */

import { generateOGImage } from './generate';
import type { OGImageOptions, SatoriElement } from './types';

/** Options for createOGResponse, extending OGImageOptions with response-specific options. */
export interface OGResponseOptions extends OGImageOptions {
  /** HTTP status code. Defaults to 200. */
  status?: number;
  /** Cache max-age in seconds. Defaults to 86400 (24 hours). */
  cacheMaxAge?: number;
  /** Additional response headers. */
  headers?: Record<string, string>;
}

/**
 * Generate an OG image and return it as a Response.
 *
 * @param element - A Satori-compatible element tree.
 * @param options - Response and image generation options.
 * @returns A Response with the PNG image body and appropriate headers.
 */
export async function createOGResponse(
  element: SatoriElement,
  options: OGResponseOptions = {},
): Promise<Response> {
  const { status = 200, cacheMaxAge = 86400, headers: extraHeaders, ...imageOptions } = options;

  const png = await generateOGImage(element, imageOptions);

  const headers = new Headers({
    'Content-Type': 'image/png',
    'Cache-Control': `public, max-age=${cacheMaxAge}`,
    ...extraHeaders,
  });

  return new Response(Buffer.from(png), { status, headers });
}
