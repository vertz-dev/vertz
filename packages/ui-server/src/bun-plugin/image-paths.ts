/**
 * Image path resolution utilities for the build-time image optimization pipeline.
 * Extracted from plugin.ts for testability.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, resolve } from 'node:path';

const EXT_MAP: Record<string, string> = {
  jpeg: '.jpg',
  jpg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
};

const MIME_MAP: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const IMG_CONTENT_TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  avif: 'image/avif',
};

/**
 * Get the content type for an image file extension.
 * Returns 'application/octet-stream' for unknown extensions.
 */
export function imageContentType(ext: string | undefined): string {
  return (ext && IMG_CONTENT_TYPES[ext]) || 'application/octet-stream';
}

/**
 * Validate that an image name from a URL is safe (no path traversal).
 * Returns false for names containing '..' or null bytes.
 */
export function isValidImageName(imgName: string): boolean {
  return !imgName.includes('..') && !imgName.includes('\0');
}

export interface ImageOutputPaths {
  webp1x: string;
  webp2x: string;
  fallback: string;
  fallbackType: string;
}

/**
 * Resolve a src attribute value to an absolute file path.
 * Absolute paths (starting with /) resolve from projectRoot.
 * Relative paths resolve from the source file's directory.
 */
export function resolveImageSrc(src: string, sourceFile: string, projectRoot: string): string {
  if (src.startsWith('/')) return resolve(projectRoot, src.slice(1));
  return resolve(dirname(sourceFile), src);
}

/**
 * Compute output paths for an optimized image.
 * Returns URL paths under `/__vertz_img/` for the three variants (webp 1x, webp 2x, fallback).
 * Returns null if the source file cannot be read.
 */
export function computeImageOutputPaths(
  sourcePath: string,
  width: number,
  height: number,
  quality: number,
  fit: string,
): ImageOutputPaths | null {
  let sourceBuffer: Buffer;
  try {
    sourceBuffer = readFileSync(sourcePath);
  } catch {
    return null;
  }

  const hash = createHash('sha256')
    .update(sourceBuffer)
    .update(`${width}x${height}q${quality}f${fit}`)
    .digest('hex')
    .slice(0, 12);

  const name = basename(sourcePath, extname(sourcePath));
  const ext = extname(sourcePath).slice(1);

  return {
    webp1x: `/__vertz_img/${name}-${hash}-${width}w.webp`,
    webp2x: `/__vertz_img/${name}-${hash}-${width * 2}w.webp`,
    fallback: `/__vertz_img/${name}-${hash}-${width * 2}w${EXT_MAP[ext] ?? '.jpg'}`,
    fallbackType: MIME_MAP[ext] ?? 'image/jpeg',
  };
}
