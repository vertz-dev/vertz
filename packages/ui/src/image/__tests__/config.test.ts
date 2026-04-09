import { afterEach, describe, expect, test } from '@vertz/test';
import {
  buildOptimizedUrl,
  configureImageOptimizer,
  resetImageOptimizer_TEST_ONLY,
} from '../config';

afterEach(() => {
  resetImageOptimizer_TEST_ONLY();
});

describe('Feature: Image optimizer URL rewriting', () => {
  describe('Given configureImageOptimizer("/_vertz/image") has been called', () => {
    describe('When buildOptimizedUrl is called with an absolute HTTPS URL', () => {
      test('Then returns the optimization URL with encoded params', () => {
        configureImageOptimizer('/_vertz/image');

        const result = buildOptimizedUrl('https://cdn.example.com/photo.jpg', 80, 80, 80, 'cover');

        expect(result).toBe(
          '/_vertz/image?url=https%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=80&h=80&q=80&fit=cover',
        );
      });
    });

    describe('When buildOptimizedUrl is called with an HTTP URL', () => {
      test('Then returns the optimization URL', () => {
        configureImageOptimizer('/_vertz/image');

        const result = buildOptimizedUrl(
          'http://cdn.example.com/photo.jpg',
          400,
          300,
          75,
          'contain',
        );

        expect(result).toBe(
          '/_vertz/image?url=http%3A%2F%2Fcdn.example.com%2Fphoto.jpg&w=400&h=300&q=75&fit=contain',
        );
      });
    });

    describe('When buildOptimizedUrl is called with a relative path "/"', () => {
      test('Then returns null (not rewritten)', () => {
        configureImageOptimizer('/_vertz/image');
        expect(buildOptimizedUrl('/public/logo.png', 120, 40, 80, 'cover')).toBeNull();
      });
    });

    describe('When buildOptimizedUrl is called with "./" relative path', () => {
      test('Then returns null', () => {
        configureImageOptimizer('/_vertz/image');
        expect(buildOptimizedUrl('./photo.jpg', 80, 80, 80, 'cover')).toBeNull();
      });
    });

    describe('When buildOptimizedUrl is called with a data URI', () => {
      test('Then returns null', () => {
        configureImageOptimizer('/_vertz/image');
        expect(buildOptimizedUrl('data:image/png;base64,abc', 80, 80, 80, 'cover')).toBeNull();
      });
    });

    describe('When buildOptimizedUrl is called with a blob URL', () => {
      test('Then returns null', () => {
        configureImageOptimizer('/_vertz/image');
        expect(buildOptimizedUrl('blob:http://localhost/uuid', 80, 80, 80, 'cover')).toBeNull();
      });
    });

    describe('When buildOptimizedUrl is called with a protocol-relative URL', () => {
      test('Then returns null (not absolute HTTP)', () => {
        configureImageOptimizer('/_vertz/image');
        expect(buildOptimizedUrl('//cdn.example.com/photo.jpg', 80, 80, 80, 'cover')).toBeNull();
      });
    });

    describe('When src contains special characters', () => {
      test('Then the url parameter is properly URL-encoded', () => {
        configureImageOptimizer('/_vertz/image');

        const result = buildOptimizedUrl(
          'https://cdn.example.com/path with spaces/photo (1).jpg',
          80,
          80,
          80,
          'cover',
        );

        expect(result).not.toBeNull();
        // The URL should contain the encoded source URL
        const params = new URLSearchParams(result?.split('?')[1]);
        expect(params.get('url')).toBe('https://cdn.example.com/path with spaces/photo (1).jpg');
      });
    });
  });

  describe('Given configureImageOptimizer has NOT been called', () => {
    describe('When buildOptimizedUrl is called with an absolute URL', () => {
      test('Then returns null (no rewriting)', () => {
        const result = buildOptimizedUrl('https://cdn.example.com/photo.jpg', 80, 80, 80, 'cover');

        expect(result).toBeNull();
      });
    });
  });
});
