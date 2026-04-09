import { describe, expect, it } from '@vertz/test';
import { content, isContentDescriptor } from '../index';

describe('Feature: Content descriptors', () => {
  describe('Given content.xml()', () => {
    const descriptor = content.xml();

    it('Then _kind is "content"', () => {
      expect(descriptor._kind).toBe('content');
    });

    it('Then _contentType is "application/xml"', () => {
      expect(descriptor._contentType).toBe('application/xml');
    });

    it('Then parse(string) returns { ok: true, data: string }', () => {
      const result = descriptor.parse('<root/>');
      expect(result).toEqual({ ok: true, data: '<root/>' });
    });

    it('Then parse(non-string) returns { ok: false }', () => {
      const result = descriptor.parse(123);
      expect(result.ok).toBe(false);
    });
  });

  describe('Given content.html()', () => {
    const descriptor = content.html();

    it('Then _contentType is "text/html"', () => {
      expect(descriptor._contentType).toBe('text/html');
    });

    it('Then parse(string) returns { ok: true, data: string }', () => {
      const result = descriptor.parse('<html></html>');
      expect(result).toEqual({ ok: true, data: '<html></html>' });
    });

    it('Then parse(non-string) returns { ok: false }', () => {
      const result = descriptor.parse({});
      expect(result.ok).toBe(false);
    });
  });

  describe('Given content.text()', () => {
    const descriptor = content.text();

    it('Then _contentType is "text/plain"', () => {
      expect(descriptor._contentType).toBe('text/plain');
    });

    it('Then parse(string) returns { ok: true, data: string }', () => {
      const result = descriptor.parse('hello');
      expect(result).toEqual({ ok: true, data: 'hello' });
    });
  });

  describe('Given content.binary()', () => {
    const descriptor = content.binary();

    it('Then _contentType is "application/octet-stream"', () => {
      expect(descriptor._contentType).toBe('application/octet-stream');
    });

    it('Then parse(Uint8Array) returns { ok: true, data: Uint8Array }', () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const result = descriptor.parse(bytes);
      expect(result).toEqual({ ok: true, data: bytes });
    });

    it('Then parse(string) returns { ok: false }', () => {
      const result = descriptor.parse('not bytes');
      expect(result.ok).toBe(false);
    });

    it('Then parse(ArrayBuffer) returns { ok: false }', () => {
      const result = descriptor.parse(new ArrayBuffer(4));
      expect(result.ok).toBe(false);
    });
  });

  describe('Given isContentDescriptor()', () => {
    it('Then returns true for content.xml()', () => {
      expect(isContentDescriptor(content.xml())).toBe(true);
    });

    it('Then returns true for content.html()', () => {
      expect(isContentDescriptor(content.html())).toBe(true);
    });

    it('Then returns false for a plain SchemaLike', () => {
      const schema = {
        parse: (v: unknown) => ({ ok: true as const, data: v }),
      };
      expect(isContentDescriptor(schema)).toBe(false);
    });
  });
});
