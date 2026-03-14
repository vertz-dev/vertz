import { describe, expect, it } from 'bun:test';
import { createNativeAdapter } from '../native-adapter';
import { NativeElement, NativeTextNode } from '../native-element';

describe('createNativeAdapter', () => {
  const adapter = createNativeAdapter();

  describe('Given createElement is called', () => {
    it('Then returns a NativeElement with the given tag', () => {
      const el = adapter.createElement('div');
      expect(el).toBeInstanceOf(NativeElement);
      expect((el as NativeElement).tag).toBe('div');
    });
  });

  describe('Given createElementNS is called', () => {
    it('Then returns a NativeElement (namespace ignored for native)', () => {
      const el = adapter.createElementNS('http://www.w3.org/2000/svg', 'rect');
      expect(el).toBeInstanceOf(NativeElement);
      expect((el as NativeElement).tag).toBe('rect');
    });
  });

  describe('Given createTextNode is called', () => {
    it('Then returns a NativeTextNode with the given text', () => {
      const text = adapter.createTextNode('hello');
      expect(text).toBeInstanceOf(NativeTextNode);
      expect((text as NativeTextNode).data).toBe('hello');
    });
  });

  describe('Given createComment is called', () => {
    it('Then returns a NativeElement with __comment tag', () => {
      const comment = adapter.createComment('placeholder');
      expect(comment).toBeInstanceOf(NativeElement);
      expect((comment as NativeElement).tag).toBe('__comment');
    });
  });

  describe('Given createDocumentFragment is called', () => {
    it('Then returns a NativeElement with __fragment tag', () => {
      const frag = adapter.createDocumentFragment();
      expect(frag).toBeInstanceOf(NativeElement);
      expect((frag as NativeElement).tag).toBe('__fragment');
    });
  });

  describe('Given isNode is called', () => {
    it('Then returns true for NativeElement', () => {
      expect(adapter.isNode(new NativeElement('div'))).toBe(true);
    });

    it('Then returns true for NativeTextNode', () => {
      expect(adapter.isNode(new NativeTextNode('hi'))).toBe(true);
    });

    it('Then returns false for plain objects', () => {
      expect(adapter.isNode({})).toBe(false);
      expect(adapter.isNode(null)).toBe(false);
      expect(adapter.isNode('string')).toBe(false);
    });
  });
});
