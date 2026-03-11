import { describe, expect, test } from 'bun:test';
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
});
