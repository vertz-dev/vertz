import { afterAll, beforeAll, describe, expect, it } from '@vertz/test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { processImage } from '../image-processor';

const TMP_DIR = resolve(import.meta.dirname, '.tmp-image-test');
const OUTPUT_DIR = resolve(TMP_DIR, 'output');
const FIXTURES_DIR = resolve(TMP_DIR, 'fixtures');

// Create test fixtures
async function createTestJpeg(path: string, width: number, height: number) {
  const buf = await sharp({
    create: { width, height, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .jpeg()
    .toBuffer();
  writeFileSync(path, buf);
}

async function createTestPng(path: string, width: number, height: number) {
  const buf = await sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer();
  writeFileSync(path, buf);
}

beforeAll(async () => {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  await createTestJpeg(resolve(FIXTURES_DIR, 'photo.jpg'), 1000, 500);
  await createTestPng(resolve(FIXTURES_DIR, 'logo.png'), 200, 100);
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('Feature: Image processing pipeline', () => {
  describe('Given a valid JPEG source image (1000x500)', () => {
    describe('When processed with width=80, height=80, fit="cover"', () => {
      it('Then creates an 80x80 WebP file (cropped to fill)', async () => {
        const result = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'photo.jpg'),
          width: 80,
          height: 80,
          quality: 80,
          fit: 'cover',
          outputDir: OUTPUT_DIR,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(existsSync(result.webp1x.path)).toBe(true);
        const meta = await sharp(result.webp1x.path).metadata();
        expect(meta.width).toBe(80);
        expect(meta.height).toBe(80);
        expect(meta.format).toBe('webp');
      });

      it('Then creates a 160x160 WebP file (2x retina)', async () => {
        const result = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'photo.jpg'),
          width: 80,
          height: 80,
          quality: 80,
          fit: 'cover',
          outputDir: OUTPUT_DIR,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(existsSync(result.webp2x.path)).toBe(true);
        const meta = await sharp(result.webp2x.path).metadata();
        expect(meta.width).toBe(160);
        expect(meta.height).toBe(160);
        expect(meta.format).toBe('webp');
      });

      it('Then creates a 160x160 JPEG fallback', async () => {
        const result = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'photo.jpg'),
          width: 80,
          height: 80,
          quality: 80,
          fit: 'cover',
          outputDir: OUTPUT_DIR,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(existsSync(result.fallback.path)).toBe(true);
        const meta = await sharp(result.fallback.path).metadata();
        expect(meta.width).toBe(160);
        expect(meta.height).toBe(160);
        expect(meta.format).toBe('jpeg');
      });

      it('Then returns paths and URLs to all generated files', async () => {
        const result = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'photo.jpg'),
          width: 80,
          height: 80,
          quality: 80,
          fit: 'cover',
          outputDir: OUTPUT_DIR,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.webp1x.url).toMatch(/\/__vertz_img\/.*\.webp$/);
        expect(result.webp2x.url).toMatch(/\/__vertz_img\/.*\.webp$/);
        expect(result.fallback.url).toMatch(/\/__vertz_img\/.*\.jpg$/);
        expect(result.fallback.format).toBe('image/jpeg');
      });
    });
  });

  describe('Given a valid PNG source image', () => {
    describe('When processed with width=120, height=40, fit="contain"', () => {
      it('Then creates WebP files fitted within bounds', async () => {
        const result = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'logo.png'),
          width: 120,
          height: 40,
          quality: 80,
          fit: 'contain',
          outputDir: OUTPUT_DIR,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const meta = await sharp(result.webp1x.path).metadata();
        // Contain fits within bounds — aspect ratio preserved
        expect(meta.width).toBeLessThanOrEqual(120);
        expect(meta.height).toBeLessThanOrEqual(40);
        expect(meta.format).toBe('webp');
      });

      it('Then creates a PNG fallback (preserves original format)', async () => {
        const result = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'logo.png'),
          width: 120,
          height: 40,
          quality: 80,
          fit: 'contain',
          outputDir: OUTPUT_DIR,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const meta = await sharp(result.fallback.path).metadata();
        expect(meta.format).toBe('png');
        expect(result.fallback.format).toBe('image/png');
      });
    });
  });

  describe('Given a source image that was already processed with same params', () => {
    describe('When processed again', () => {
      it('Then returns cached paths without reprocessing', async () => {
        const opts = {
          sourcePath: resolve(FIXTURES_DIR, 'photo.jpg'),
          width: 40,
          height: 40,
          quality: 80,
          fit: 'cover' as const,
          outputDir: OUTPUT_DIR,
        };

        // First call
        const result1 = await processImage(opts);
        expect(result1.ok).toBe(true);
        if (!result1.ok) return;

        // Record file mod time
        const stat1 = Bun.file(result1.webp1x.path).lastModified;

        // Small delay to ensure different timestamp if reprocessed
        await new Promise((r) => setTimeout(r, 10));

        // Second call — should hit cache
        const result2 = await processImage(opts);
        expect(result2.ok).toBe(true);
        if (!result2.ok) return;

        const stat2 = Bun.file(result2.webp1x.path).lastModified;
        expect(stat2).toBe(stat1); // File not rewritten
      });
    });
  });

  describe('Given a source path that does not exist', () => {
    describe('When processed', () => {
      it('Then returns an error result (no crash)', async () => {
        const result = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'nonexistent.jpg'),
          width: 80,
          height: 80,
          quality: 80,
          fit: 'cover',
          outputDir: OUTPUT_DIR,
        });

        expect(result.ok).toBe(false);
      });

      it('Then includes the missing file path in the error', async () => {
        const result = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'nonexistent.jpg'),
          width: 80,
          height: 80,
          quality: 80,
          fit: 'cover',
          outputDir: OUTPUT_DIR,
        });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error).toContain('nonexistent.jpg');
      });
    });
  });

  describe('Given quality=60', () => {
    describe('When processed', () => {
      it('Then produces smaller WebP files than quality=80', async () => {
        const q80 = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'photo.jpg'),
          width: 200,
          height: 200,
          quality: 80,
          fit: 'cover',
          outputDir: OUTPUT_DIR,
        });

        const q60 = await processImage({
          sourcePath: resolve(FIXTURES_DIR, 'photo.jpg'),
          width: 200,
          height: 200,
          quality: 60,
          fit: 'cover',
          outputDir: OUTPUT_DIR,
        });

        expect(q80.ok).toBe(true);
        expect(q60.ok).toBe(true);
        if (!q80.ok || !q60.ok) return;

        const size80 = Bun.file(q80.webp1x.path).size;
        const size60 = Bun.file(q60.webp1x.path).size;
        expect(size60).toBeLessThan(size80);
      });
    });
  });
});
