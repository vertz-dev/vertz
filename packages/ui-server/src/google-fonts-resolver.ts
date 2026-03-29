/**
 * Google Fonts resolver.
 *
 * Fetches Google Fonts CSS2 API, parses .woff2 URLs, downloads to a local cache,
 * and returns new FontDescriptor objects with local `src` paths.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import type { FontDescriptor, GoogleFontMeta } from '@vertz/ui/css';

// ─── Types ──────────────────────────────────────────────────

interface ManifestEntry {
  hash: string;
  files: string[];
  sizes: number[];
}

interface CacheManifest {
  entries: Record<string, ManifestEntry>;
}

// ─── Constants ──────────────────────────────────────────────

const GOOGLE_FONTS_CSS2_URL = 'https://fonts.googleapis.com/css2';

/** Modern user-agent to ensure Google returns woff2 format. */
const MODERN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Minimum valid woff2 file size (bytes). Files smaller than this are treated as corrupt. */
const MIN_WOFF2_SIZE = 100;

// ─── URL Building ───────────────────────────────────────────

/**
 * Build a Google Fonts CSS2 API URL for a font family.
 */
export function buildGoogleFontsUrl(
  family: string,
  meta: Pick<GoogleFontMeta, 'weight' | 'style' | 'subsets' | 'display'>,
): string {
  const encodedFamily = family.replace(/ /g, '+');
  const weightSpec = formatWeightSpec(meta.weight);
  const hasItalic = meta.style.includes('italic');

  let familyParam: string;
  if (hasItalic && meta.style.includes('normal')) {
    // Both normal and italic — use ital axis
    familyParam = `${encodedFamily}:ital,wght@0,${weightSpec};1,${weightSpec}`;
  } else if (hasItalic) {
    familyParam = `${encodedFamily}:ital,wght@1,${weightSpec}`;
  } else {
    familyParam = `${encodedFamily}:wght@${weightSpec}`;
  }

  return `${GOOGLE_FONTS_CSS2_URL}?family=${familyParam}&display=${meta.display}`;
}

function formatWeightSpec(weight: string | number | number[]): string {
  if (Array.isArray(weight)) {
    return weight.join(';');
  }
  return String(weight);
}

// ─── CSS Parsing ────────────────────────────────────────────

/**
 * Extract .woff2 URLs from a Google Fonts CSS response.
 */
export function parseWoff2UrlsFromCss(css: string): string[] {
  const urls: string[] = [];
  const regex = /url\(([^)]+\.woff2)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(css)) !== null) {
    urls.push(match[1]!);
  }
  return urls;
}

// ─── Cache ──────────────────────────────────────────────────

function computeOptionsHash(meta: GoogleFontMeta): string {
  const data = JSON.stringify({
    family: meta.family,
    weight: meta.weight,
    style: meta.style,
    subsets: meta.subsets,
    display: meta.display,
  });
  return createHash('sha256').update(data).digest('hex').slice(0, 12);
}

function readManifest(cacheDir: string): CacheManifest {
  const manifestPath = join(cacheDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      return JSON.parse(readFileSync(manifestPath, 'utf-8')) as CacheManifest;
    } catch {
      return { entries: {} };
    }
  }
  return { entries: {} };
}

function writeManifest(cacheDir: string, manifest: CacheManifest): void {
  const manifestPath = join(cacheDir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

function isCacheValid(cacheDir: string, entry: ManifestEntry): boolean {
  for (let i = 0; i < entry.files.length; i++) {
    const filePath = join(cacheDir, entry.files[i]!);
    if (!existsSync(filePath)) return false;
    const stat = Bun.file(filePath).size;
    if (stat < MIN_WOFF2_SIZE) return false;
  }
  return true;
}

// ─── Download ───────────────────────────────────────────────

async function downloadFile(url: string, destPath: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  const tmpPath = destPath + '.tmp';
  writeFileSync(tmpPath, Buffer.from(buffer));
  renameSync(tmpPath, destPath);
  return buffer.byteLength;
}

// ─── Resolver ───────────────────────────────────────────────

/**
 * Resolve Google Font descriptors by fetching .woff2 files to a local cache.
 *
 * Non-google descriptors are passed through unchanged.
 * Google descriptors get new FontDescriptor objects with `src` paths
 * relative to `projectRoot` (e.g., `.vertz/fonts/inter-abc123.woff2`).
 *
 * @param fonts - Font descriptors from theme
 * @param cacheDir - Absolute path to cache directory (e.g., `<projectRoot>/.vertz/fonts`)
 * @param projectRoot - Optional project root for generating relative src paths.
 *   When provided, src paths are relative to root (for URL generation in @font-face CSS).
 *   When omitted, src paths are absolute (for unit tests).
 */
export async function resolveGoogleFonts(
  fonts: Record<string, FontDescriptor>,
  cacheDir: string,
  projectRoot?: string,
): Promise<Record<string, FontDescriptor>> {
  mkdirSync(cacheDir, { recursive: true });

  const manifest = readManifest(cacheDir);
  const result: Record<string, FontDescriptor> = {};
  const googleEntries: Array<{ key: string; descriptor: FontDescriptor }> = [];

  // Separate google from non-google descriptors
  for (const [key, descriptor] of Object.entries(fonts)) {
    if (descriptor.__google) {
      googleEntries.push({ key, descriptor });
    } else {
      result[key] = descriptor;
    }
  }

  // Resolve all google fonts in parallel
  await Promise.all(
    googleEntries.map(async ({ key, descriptor }) => {
      const meta = descriptor.__google!;
      const hash = computeOptionsHash(meta);

      // Check cache
      const cached = manifest.entries[hash];
      if (cached && isCacheValid(cacheDir, cached)) {
        // Cache hit — create resolved descriptor
        const srcPath = toSrcPath(cacheDir, cached.files[0]!, projectRoot);
        result[key] = createResolvedDescriptor(descriptor, srcPath);
        return;
      }

      // Cache miss — fetch from Google
      try {
        const url = buildGoogleFontsUrl(meta.family, meta);
        const response = await fetch(url, {
          headers: { 'User-Agent': MODERN_USER_AGENT },
        });

        if (!response.ok) {
          console.error(
            `[vertz] Error: Google Fonts returned ${response.status} for family "${meta.family}".` +
              '\n        Check https://fonts.google.com for the correct name.',
          );
          result[key] = descriptor;
          return;
        }

        const css = await response.text();
        const woff2Urls = parseWoff2UrlsFromCss(css);

        if (woff2Urls.length === 0) {
          console.error(
            `[vertz] Error: No .woff2 URLs found in Google Fonts response for "${meta.family}".`,
          );
          result[key] = descriptor;
          return;
        }

        // Download the primary woff2 file (first URL = primary latin subset)
        const familySlug = meta.family.toLowerCase().replace(/\s+/g, '-');
        const fileName = `${familySlug}-${hash}.woff2`;
        const destPath = join(cacheDir, fileName);
        const size = await downloadFile(woff2Urls[0]!, destPath);

        // Update manifest
        manifest.entries[hash] = { hash, files: [fileName], sizes: [size] };

        const totalKB = Math.round(size / 1024);
        console.log(`[vertz] Fetching Google Font: ${meta.family}... done (1 file, ${totalKB}KB)`);

        const srcPath = toSrcPath(cacheDir, fileName, projectRoot);
        result[key] = createResolvedDescriptor(descriptor, srcPath);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[vertz] Error resolving Google Font "${meta.family}": ${msg}`);
        result[key] = descriptor;
      }
    }),
  );

  writeManifest(cacheDir, manifest);

  return result;
}

/**
 * Convert a cache dir + filename to the src path stored on the descriptor.
 * When projectRoot is provided, returns a root-relative URL path
 * (e.g., `/.vertz/fonts/inter-abc.woff2`) for use in CSS `url()` and preload `href`.
 * Otherwise returns the absolute filesystem path (used in tests).
 */
function toSrcPath(cacheDir: string, fileName: string, projectRoot?: string): string {
  const absPath = join(cacheDir, fileName);
  if (projectRoot) {
    return '/' + relative(projectRoot, absPath);
  }
  return absPath;
}

function createResolvedDescriptor(original: FontDescriptor, srcPath: string): FontDescriptor {
  return {
    __brand: 'FontDescriptor',
    family: original.family,
    weight: original.weight,
    style: original.style,
    display: original.display,
    src: srcPath,
    fallback: original.fallback,
    subsets: original.subsets,
    unicodeRange: original.unicodeRange,
    adjustFontFallback: original.adjustFontFallback,
    __google: original.__google,
  };
}
