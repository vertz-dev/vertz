/**
 * Image loading utility for OG image components.
 *
 * Converts images from various sources (file paths, URLs, raw SVG strings)
 * into data URIs suitable for embedding in Satori elements.
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/**
 * Load an image from a file path, URL, or raw SVG string and return a data URI.
 *
 * - **SVG strings** (starting with `<svg`): URL-encoded `data:image/svg+xml,...`
 * - **File paths**: Read from disk, base64-encoded with MIME type from extension
 * - **URLs** (starting with `http://` or `https://`): Fetched and base64-encoded
 *
 * @param source - A file path, URL, or raw SVG string.
 * @returns A data URI string suitable for use in `<img src="...">`.
 */
export async function loadImage(source: string): Promise<string> {
  // Raw SVG string
  if (source.trimStart().startsWith('<svg')) {
    return `data:image/svg+xml,${encodeURIComponent(source)}`;
  }

  // URL
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const response = await fetch(source);

    if (!response.ok) {
      throw new Error(`Failed to fetch image from ${source} (HTTP ${response.status})`);
    }

    const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream';
    const mime = contentType.split(';')[0]?.trim() ?? 'application/octet-stream';
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:${mime};base64,${base64}`;
  }

  // File path
  const ext = extname(source).toLowerCase();
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
  const data = await readFile(source);
  const base64 = Buffer.from(data).toString('base64');
  return `data:${mime};base64,${base64}`;
}
