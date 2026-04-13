import { afterAll, beforeAll, describe, expect, it } from '@vertz/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeImageOutputPaths,
  imageContentType,
  isValidImageName,
  resolveImageSrc,
} from '../image-paths';

const TMP_DIR = resolve(import.meta.dirname, '.tmp-image-paths-test');

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(resolve(TMP_DIR, 'photo.jpg'), 'fake-jpeg-content');
  writeFileSync(resolve(TMP_DIR, 'logo.png'), 'fake-png-content');
  writeFileSync(resolve(TMP_DIR, 'icon.gif'), 'fake-gif-content');
  writeFileSync(resolve(TMP_DIR, 'hero.webp'), 'fake-webp-content');
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('Feature: Image path resolution', () => {
  describe('Given resolveImageSrc', () => {
    describe('When src starts with /', () => {
      it('Then resolves from projectRoot', () => {
        const result = resolveImageSrc('/public/photo.jpg', '/proj/src/app.tsx', '/proj');
        expect(result).toBe(resolve('/proj', 'public/photo.jpg'));
      });
    });

    describe('When src is relative', () => {
      it('Then resolves from the source file directory', () => {
        const result = resolveImageSrc('./images/photo.jpg', '/proj/src/app.tsx', '/proj');
        expect(result).toBe(resolve('/proj/src', 'images/photo.jpg'));
      });
    });

    describe('When src is a bare filename', () => {
      it('Then resolves from the source file directory', () => {
        const result = resolveImageSrc('photo.jpg', '/proj/src/components/hero.tsx', '/proj');
        expect(result).toBe(resolve('/proj/src/components', 'photo.jpg'));
      });
    });
  });

  describe('Given computeImageOutputPaths', () => {
    describe('When source file exists (JPEG)', () => {
      it('Then returns paths with /__vertz_img/ prefix', () => {
        const result = computeImageOutputPaths(resolve(TMP_DIR, 'photo.jpg'), 80, 80, 80, 'cover');

        expect(result).not.toBeNull();
        expect(result!.webp1x).toMatch(/^\/__vertz_img\/photo-[a-f0-9]{12}-80w\.webp$/);
        expect(result!.webp2x).toMatch(/^\/__vertz_img\/photo-[a-f0-9]{12}-160w\.webp$/);
        expect(result!.fallback).toMatch(/^\/__vertz_img\/photo-[a-f0-9]{12}-160w\.jpg$/);
        expect(result!.fallbackType).toBe('image/jpeg');
      });
    });

    describe('When source file exists (PNG)', () => {
      it('Then returns .png fallback extension and image/png mime', () => {
        const result = computeImageOutputPaths(
          resolve(TMP_DIR, 'logo.png'),
          120,
          40,
          80,
          'contain',
        );

        expect(result).not.toBeNull();
        expect(result!.fallback).toContain('.png');
        expect(result!.fallbackType).toBe('image/png');
      });
    });

    describe('When source file exists (GIF)', () => {
      it('Then returns .gif fallback extension and image/gif mime', () => {
        const result = computeImageOutputPaths(resolve(TMP_DIR, 'icon.gif'), 32, 32, 80, 'cover');

        expect(result).not.toBeNull();
        expect(result!.fallback).toContain('.gif');
        expect(result!.fallbackType).toBe('image/gif');
      });
    });

    describe('When source file exists (WebP)', () => {
      it('Then returns .webp fallback extension and image/webp mime', () => {
        const result = computeImageOutputPaths(
          resolve(TMP_DIR, 'hero.webp'),
          200,
          100,
          80,
          'cover',
        );

        expect(result).not.toBeNull();
        expect(result!.fallback).toMatch(/\.webp$/);
        expect(result!.fallbackType).toBe('image/webp');
      });
    });

    describe('When source file does not exist', () => {
      it('Then returns null', () => {
        const result = computeImageOutputPaths('/nonexistent/image.jpg', 80, 80, 80, 'cover');
        expect(result).toBeNull();
      });
    });

    describe('When same file is processed with different dimensions', () => {
      it('Then produces different hashes', () => {
        const r1 = computeImageOutputPaths(resolve(TMP_DIR, 'photo.jpg'), 80, 80, 80, 'cover');
        const r2 = computeImageOutputPaths(resolve(TMP_DIR, 'photo.jpg'), 200, 200, 80, 'cover');

        expect(r1).not.toBeNull();
        expect(r2).not.toBeNull();
        expect(r1!.webp1x).not.toBe(r2!.webp1x);
      });
    });

    describe('When same file is processed with different quality', () => {
      it('Then produces different hashes', () => {
        const r1 = computeImageOutputPaths(resolve(TMP_DIR, 'photo.jpg'), 80, 80, 80, 'cover');
        const r2 = computeImageOutputPaths(resolve(TMP_DIR, 'photo.jpg'), 80, 80, 60, 'cover');

        expect(r1).not.toBeNull();
        expect(r2).not.toBeNull();
        expect(r1!.webp1x).not.toBe(r2!.webp1x);
      });
    });

    describe('When same file is processed with same params', () => {
      it('Then produces identical paths (deterministic)', () => {
        const r1 = computeImageOutputPaths(resolve(TMP_DIR, 'photo.jpg'), 80, 80, 80, 'cover');
        const r2 = computeImageOutputPaths(resolve(TMP_DIR, 'photo.jpg'), 80, 80, 80, 'cover');

        expect(r1).toEqual(r2);
      });
    });
  });

  describe('Given imageContentType', () => {
    it('Then returns image/webp for "webp"', () => {
      expect(imageContentType('webp')).toBe('image/webp');
    });

    it('Then returns image/png for "png"', () => {
      expect(imageContentType('png')).toBe('image/png');
    });

    it('Then returns image/jpeg for "jpg"', () => {
      expect(imageContentType('jpg')).toBe('image/jpeg');
    });

    it('Then returns image/jpeg for "jpeg"', () => {
      expect(imageContentType('jpeg')).toBe('image/jpeg');
    });

    it('Then returns image/gif for "gif"', () => {
      expect(imageContentType('gif')).toBe('image/gif');
    });

    it('Then returns image/avif for "avif"', () => {
      expect(imageContentType('avif')).toBe('image/avif');
    });

    it('Then returns application/octet-stream for unknown extension', () => {
      expect(imageContentType('bmp')).toBe('application/octet-stream');
    });

    it('Then returns application/octet-stream for undefined', () => {
      expect(imageContentType(undefined)).toBe('application/octet-stream');
    });
  });

  describe('Given isValidImageName', () => {
    it('Then returns true for a simple filename', () => {
      expect(isValidImageName('photo-abc123-80w.webp')).toBe(true);
    });

    it('Then returns false for path with ".."', () => {
      expect(isValidImageName('../../../etc/passwd')).toBe(false);
    });

    it('Then returns false for path with encoded ".."', () => {
      expect(isValidImageName('..%2F..%2Fetc/passwd')).toBe(false);
    });

    it('Then returns false for path with null byte', () => {
      expect(isValidImageName('photo.webp\0.html')).toBe(false);
    });

    it('Then returns true for nested path without traversal', () => {
      expect(isValidImageName('subdir/photo-abc-80w.webp')).toBe(true);
    });
  });
});
