import { afterEach, describe, expect, test } from 'bun:test';
import { configureImageOptimizer, resetImageOptimizer_TEST_ONLY } from '../config';
import { Image } from '../image';

describe('Feature: Image component runtime rendering', () => {
  describe('Given an Image with all required props', () => {
    describe('When rendered', () => {
      test('Then renders an <img> element with src, width, height, alt', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Profile photo',
        });

        expect(el.tagName).toBe('IMG');
        expect(el.getAttribute('src')).toBe('/photo.jpg');
        expect(el.getAttribute('width')).toBe('80');
        expect(el.getAttribute('height')).toBe('80');
        expect(el.getAttribute('alt')).toBe('Profile photo');
      });

      test('Then defaults loading to "lazy"', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
        });

        expect(el.getAttribute('loading')).toBe('lazy');
      });

      test('Then defaults decoding to "async"', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
        });

        expect(el.getAttribute('decoding')).toBe('async');
      });
    });
  });

  describe('Given an Image with class and style props', () => {
    describe('When rendered', () => {
      test('Then applies class to the <img> element', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          class: 'rounded-full',
        });

        expect(el.getAttribute('class')).toBe('rounded-full');
      });

      test('Then applies style to the <img> element', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          style: 'object-fit: cover',
        });

        expect(el.getAttribute('style')).toBe('object-fit: cover');
      });
    });
  });

  describe('Given an Image with loading="eager"', () => {
    describe('When rendered', () => {
      test('Then sets loading="eager" on the <img>', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          loading: 'eager',
        });

        expect(el.getAttribute('loading')).toBe('eager');
      });
    });
  });

  describe('Given an Image with priority={true}', () => {
    describe('When rendered', () => {
      test('Then sets loading="eager" on the <img>', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          priority: true,
        });

        expect(el.getAttribute('loading')).toBe('eager');
      });

      test('Then sets decoding="sync" on the <img>', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          priority: true,
        });

        expect(el.getAttribute('decoding')).toBe('sync');
      });

      test('Then sets fetchpriority="high" on the <img>', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          priority: true,
        });

        expect(el.getAttribute('fetchpriority')).toBe('high');
      });
    });
  });

  describe('Given an Image with pass-through HTML attributes', () => {
    describe('When rendered', () => {
      test('Then passes data-testid to the <img>', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          'data-testid': 'hero-image',
        });

        expect(el.getAttribute('data-testid')).toBe('hero-image');
      });

      test('Then passes aria-hidden to the <img>', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          'aria-hidden': 'true',
        });

        expect(el.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });

  describe('Given an Image with build-only props (quality, fit, pictureClass)', () => {
    describe('When rendered at runtime', () => {
      test('Then ignores quality (no attribute on <img>)', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          quality: 60,
        });

        expect(el.getAttribute('quality')).toBeNull();
      });

      test('Then ignores fit (no attribute on <img>)', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          fit: 'contain',
        });

        expect(el.getAttribute('fit')).toBeNull();
      });

      test('Then ignores pictureClass (no <picture> wrapper)', () => {
        const el = Image({
          src: '/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
          pictureClass: 'wrapper',
        });

        // Should be a plain <img>, not wrapped in <picture>
        expect(el.tagName).toBe('IMG');
        expect(el.getAttribute('pictureClass')).toBeNull();
      });
    });
  });

  describe('Given configureImageOptimizer("/_vertz/image") has been called', () => {
    afterEach(() => {
      resetImageOptimizer_TEST_ONLY();
    });

    describe('When <Image> renders with src="https://cdn.example.com/photo.jpg"', () => {
      test('Then the <img> src is rewritten to the optimization URL', () => {
        configureImageOptimizer('/_vertz/image');

        const el = Image({
          src: 'https://cdn.example.com/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
        });

        expect(el.getAttribute('src')).toBe(
          '/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=80&h=80&q=80&fit=cover',
        );
      });
    });

    describe('When <Image> renders with src="/public/logo.png" (relative path)', () => {
      test('Then the <img> src is the original path (not rewritten)', () => {
        configureImageOptimizer('/_vertz/image');

        const el = Image({
          src: '/public/logo.png',
          width: 120,
          height: 40,
          alt: 'Logo',
        });

        expect(el.getAttribute('src')).toBe('/public/logo.png');
      });
    });

    describe('When <Image> renders with quality={60} and fit="contain"', () => {
      test('Then the optimization URL includes q=60 and fit=contain', () => {
        configureImageOptimizer('/_vertz/image');

        const el = Image({
          src: 'https://cdn.example.com/photo.jpg',
          width: 400,
          height: 300,
          alt: 'Photo',
          quality: 60,
          fit: 'contain',
        });

        const src = el.getAttribute('src') ?? '';
        const params = new URLSearchParams(src.split('?')[1]);
        expect(params.get('q')).toBe('60');
        expect(params.get('fit')).toBe('contain');
      });
    });

    describe('When <Image> renders with src="data:image/png;base64,..."', () => {
      test('Then the <img> src is the data URI (not rewritten)', () => {
        configureImageOptimizer('/_vertz/image');

        const el = Image({
          src: 'data:image/png;base64,abc',
          width: 16,
          height: 16,
          alt: 'Icon',
        });

        expect(el.getAttribute('src')).toBe('data:image/png;base64,abc');
      });
    });

    describe('When <Image> renders with src="//cdn.example.com/photo.jpg" (protocol-relative)', () => {
      test('Then the <img> src is the original URL (not rewritten)', () => {
        configureImageOptimizer('/_vertz/image');

        const el = Image({
          src: '//cdn.example.com/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
        });

        expect(el.getAttribute('src')).toBe('//cdn.example.com/photo.jpg');
      });
    });
  });

  describe('Given configureImageOptimizer has NOT been called', () => {
    describe('When <Image> renders with src="https://cdn.example.com/photo.jpg"', () => {
      test('Then the <img> src is the original URL (no rewriting)', () => {
        const el = Image({
          src: 'https://cdn.example.com/photo.jpg',
          width: 80,
          height: 80,
          alt: 'Photo',
        });

        expect(el.getAttribute('src')).toBe('https://cdn.example.com/photo.jpg');
      });
    });
  });
});
