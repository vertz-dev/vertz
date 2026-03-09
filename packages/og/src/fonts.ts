/**
 * Google Fonts loading utility for Satori.
 *
 * Fetches font data in TTF format (Satori doesn't support woff2)
 * by using the Googlebot User-Agent header.
 */

import type { FontWeight } from './types';

/**
 * Load a Google Font by family name and weight.
 *
 * @param family - The Google Font family name (e.g., "Inter", "DM Sans").
 * @param weight - The font weight (100-900). Defaults to 400.
 * @returns The font data as an ArrayBuffer.
 */
export async function loadGoogleFont(
  family: string,
  weight: FontWeight = 400,
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({
    family: `${family}:wght@${weight}`,
    display: 'swap',
  });
  const cssUrl = `https://fonts.googleapis.com/css2?${params}`;

  // Fetch CSS with a User-Agent that returns TTF (Satori supports woff/ttf/otf, not woff2)
  const cssResponse = await fetch(cssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
  });

  if (!cssResponse.ok) {
    throw new Error(
      `Failed to fetch Google Font CSS for ${family}:${weight} (HTTP ${cssResponse.status})`,
    );
  }

  const css = await cssResponse.text();

  // Extract the first font file URL from the CSS
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match?.[1]) {
    throw new Error(`Could not extract font URL for ${family}:${weight}`);
  }

  const fontResponse = await fetch(match[1]);

  if (!fontResponse.ok) {
    throw new Error(
      `Failed to fetch font file for ${family}:${weight} (HTTP ${fontResponse.status})`,
    );
  }

  return fontResponse.arrayBuffer();
}
