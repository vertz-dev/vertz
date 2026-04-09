/**
 * Image processor — resizes images and converts to WebP using sharp.
 * Produces 1x + 2x retina WebP variants and an original-format fallback.
 * Results are cached by content hash in the output directory.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import type sharp from 'sharp';

let _sharp: typeof sharp | undefined;

async function getSharp(): Promise<typeof sharp> {
  if (!_sharp) {
    _sharp = (await import('sharp')).default;
  }
  return _sharp;
}

export interface ProcessImageOptions {
  sourcePath: string;
  width: number;
  height: number;
  quality: number;
  fit: 'cover' | 'contain' | 'fill';
  outputDir: string;
}

interface ImageOutputFile {
  path: string;
  url: string;
}

export type ProcessImageResult =
  | {
      ok: true;
      webp1x: ImageOutputFile;
      webp2x: ImageOutputFile;
      fallback: ImageOutputFile & { format: string };
    }
  | { ok: false; error: string };

const FORMAT_MAP: Record<string, { ext: string; mime: string }> = {
  jpeg: { ext: '.jpg', mime: 'image/jpeg' },
  jpg: { ext: '.jpg', mime: 'image/jpeg' },
  png: { ext: '.png', mime: 'image/png' },
  webp: { ext: '.webp', mime: 'image/webp' },
  gif: { ext: '.gif', mime: 'image/gif' },
  tiff: { ext: '.tiff', mime: 'image/tiff' },
  avif: { ext: '.avif', mime: 'image/avif' },
};

export async function processImage(opts: ProcessImageOptions): Promise<ProcessImageResult> {
  const { sourcePath, width, height, quality, fit, outputDir } = opts;

  // Check source exists
  if (!existsSync(sourcePath)) {
    return { ok: false, error: `Image not found: ${sourcePath}` };
  }

  // Read source and compute content hash
  const sourceBuffer = readFileSync(sourcePath);
  const hash = createHash('sha256')
    .update(sourceBuffer)
    .update(`${width}x${height}q${quality}f${fit}`)
    .digest('hex')
    .slice(0, 12);

  const name = basename(sourcePath, extname(sourcePath));

  // Load sharp lazily — only when actually processing images
  const sharpModule = await getSharp();

  // Detect source format
  const meta = await sharpModule(sourceBuffer).metadata();
  const sourceFormat = meta.format ?? 'jpeg';
  const defaultFormat = { ext: '.jpg', mime: 'image/jpeg' };
  const formatInfo = FORMAT_MAP[sourceFormat] ?? defaultFormat;

  // Output file names
  const webp1xName = `${name}-${hash}-${width}w.webp`;
  const webp2xName = `${name}-${hash}-${width * 2}w.webp`;
  const fallbackName = `${name}-${hash}-${width * 2}w${formatInfo.ext}`;

  const webp1xPath = resolve(outputDir, webp1xName);
  const webp2xPath = resolve(outputDir, webp2xName);
  const fallbackPath = resolve(outputDir, fallbackName);

  // Cache check — if all outputs exist, skip processing
  if (existsSync(webp1xPath) && existsSync(webp2xPath) && existsSync(fallbackPath)) {
    return {
      ok: true,
      webp1x: { path: webp1xPath, url: `/__vertz_img/${webp1xName}` },
      webp2x: { path: webp2xPath, url: `/__vertz_img/${webp2xName}` },
      fallback: {
        path: fallbackPath,
        url: `/__vertz_img/${fallbackName}`,
        format: formatInfo.mime,
      },
    };
  }

  mkdirSync(outputDir, { recursive: true });

  // Process all variants in parallel
  const sharpFit = fit as 'cover' | 'contain' | 'fill';

  const [webp1xBuf, webp2xBuf, fallbackBuf] = await Promise.all([
    // 1x WebP
    sharpModule(sourceBuffer).resize(width, height, { fit: sharpFit }).webp({ quality }).toBuffer(),
    // 2x WebP (retina)
    sharpModule(sourceBuffer)
      .resize(width * 2, height * 2, { fit: sharpFit })
      .webp({ quality })
      .toBuffer(),
    // Fallback in original format at 2x
    sharpModule(sourceBuffer)
      .resize(width * 2, height * 2, { fit: sharpFit })
      .toFormat(sourceFormat as keyof sharp.FormatEnum, { quality })
      .toBuffer(),
  ]);

  writeFileSync(webp1xPath, webp1xBuf);
  writeFileSync(webp2xPath, webp2xBuf);
  writeFileSync(fallbackPath, fallbackBuf);

  return {
    ok: true,
    webp1x: { path: webp1xPath, url: `/__vertz_img/${webp1xName}` },
    webp2x: { path: webp2xPath, url: `/__vertz_img/${webp2xName}` },
    fallback: { path: fallbackPath, url: `/__vertz_img/${fallbackName}`, format: formatInfo.mime },
  };
}
