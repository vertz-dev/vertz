import { describe, expect, it } from 'bun:test';
import { createDOMAdapter } from '../dom-adapter';

describe('createDOMAdapter', () => {
  it('createElement returns an HTMLDivElement for div', () => {
    const adapter = createDOMAdapter();
    const el = adapter.createElement('div');
    expect(el).toBeInstanceOf(HTMLDivElement);
  });

  it('createTextNode returns a Text node with the given data', () => {
    const adapter = createDOMAdapter();
    const text = adapter.createTextNode('hello');
    expect(text).toBeInstanceOf(Text);
    expect(text.data).toBe('hello');
  });

  it('createComment returns a Comment node', () => {
    const adapter = createDOMAdapter();
    const comment = adapter.createComment('test');
    expect(comment).toBeInstanceOf(Comment);
  });

  it('createDocumentFragment returns a DocumentFragment', () => {
    const adapter = createDOMAdapter();
    const fragment = adapter.createDocumentFragment();
    expect(fragment).toBeInstanceOf(DocumentFragment);
  });

  it('isNode returns true for DOM nodes', () => {
    const adapter = createDOMAdapter();
    expect(adapter.isNode(document.createElement('div'))).toBe(true);
    expect(adapter.isNode(document.createTextNode('t'))).toBe(true);
  });

  it('isNode returns false for plain objects', () => {
    const adapter = createDOMAdapter();
    expect(adapter.isNode({})).toBe(false);
    expect(adapter.isNode(null)).toBe(false);
    expect(adapter.isNode('text')).toBe(false);
  });
});
