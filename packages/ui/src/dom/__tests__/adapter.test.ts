import { afterEach, describe, expect, it } from 'bun:test';
import {
  getAdapter,
  isRenderNode,
  RENDER_NODE_BRAND,
  type RenderAdapter,
  setAdapter,
} from '../adapter';

describe('isRenderNode', () => {
  it('returns false for null', () => {
    expect(isRenderNode(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isRenderNode(undefined)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRenderNode(42)).toBe(false);
    expect(isRenderNode('hello')).toBe(false);
    expect(isRenderNode(true)).toBe(false);
  });

  it('returns false for plain objects', () => {
    expect(isRenderNode({})).toBe(false);
    expect(isRenderNode({ tag: 'div' })).toBe(false);
  });

  it('returns true for objects with RENDER_NODE_BRAND', () => {
    const branded = { [RENDER_NODE_BRAND]: true as const };
    expect(isRenderNode(branded)).toBe(true);
  });

  it('returns true for browser DOM nodes via instanceof Node fallback', () => {
    const div = document.createElement('div');
    expect(isRenderNode(div)).toBe(true);
  });
});

describe('getAdapter / setAdapter', () => {
  afterEach(() => {
    // Reset to auto-detect
    setAdapter(null);
  });

  it('getAdapter() auto-creates DOMAdapter when document exists', () => {
    const adapter = getAdapter();
    expect(adapter).toBeDefined();
    expect(adapter.createElement).toBeTypeOf('function');
    expect(adapter.createTextNode).toBeTypeOf('function');
    expect(adapter.createComment).toBeTypeOf('function');
    expect(adapter.createDocumentFragment).toBeTypeOf('function');
    expect(adapter.isNode).toBeTypeOf('function');
  });

  it('setAdapter() overrides the auto-detected adapter', () => {
    const custom: RenderAdapter = {
      createElement: () => {
        throw new Error('custom');
      },
      createElementNS: () => {
        throw new Error('custom');
      },
      createTextNode: () => {
        throw new Error('custom');
      },
      createComment: () => {
        throw new Error('custom');
      },
      createDocumentFragment: () => {
        throw new Error('custom');
      },
      isNode: () => false,
    };

    setAdapter(custom);
    expect(getAdapter()).toBe(custom);
  });

  it('getAdapter() returns the adapter set by setAdapter()', () => {
    const custom: RenderAdapter = {
      createElement: () => {
        throw new Error('custom');
      },
      createElementNS: () => {
        throw new Error('custom');
      },
      createTextNode: () => {
        throw new Error('custom');
      },
      createComment: () => {
        throw new Error('custom');
      },
      createDocumentFragment: () => {
        throw new Error('custom');
      },
      isNode: () => false,
    };

    setAdapter(custom);
    const adapter1 = getAdapter();
    const adapter2 = getAdapter();
    expect(adapter1).toBe(adapter2);
    expect(adapter1).toBe(custom);
  });

  it('setAdapter(null) resets to auto-detect', () => {
    const custom: RenderAdapter = {
      createElement: () => {
        throw new Error('custom');
      },
      createElementNS: () => {
        throw new Error('custom');
      },
      createTextNode: () => {
        throw new Error('custom');
      },
      createComment: () => {
        throw new Error('custom');
      },
      createDocumentFragment: () => {
        throw new Error('custom');
      },
      isNode: () => false,
    };

    setAdapter(custom);
    expect(getAdapter()).toBe(custom);

    setAdapter(null);
    const adapter = getAdapter();
    expect(adapter).not.toBe(custom);
    // Should be a DOMAdapter since document exists in test env
    const el = adapter.createElement('div');
    expect(el).toBeInstanceOf(HTMLDivElement);
  });
});
