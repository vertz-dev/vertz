import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  claimComment,
  claimElement,
  claimText,
  endHydration,
  enterChildren,
  exitChildren,
  getIsHydrating,
  startHydration,
} from '../hydration-context';

describe('hydration-context', () => {
  afterEach(() => {
    endHydration();
  });

  describe('startHydration / endHydration', () => {
    it('sets hydrating flag to true on start and false on end', () => {
      const root = document.createElement('div');
      expect(getIsHydrating()).toBe(false);
      startHydration(root);
      expect(getIsHydrating()).toBe(true);
      endHydration();
      expect(getIsHydrating()).toBe(false);
    });

    it('resets all state (cursor, stack, flag)', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><span></span></div>';
      startHydration(root);

      // Enter children to push stack
      const div = claimElement('div')!;
      enterChildren(div);

      // Now end — everything should reset
      endHydration();
      expect(getIsHydrating()).toBe(false);

      // Starting again should work cleanly
      startHydration(root);
      const div2 = claimElement('div');
      expect(div2).toBe(div);
    });
  });

  describe('claimElement', () => {
    it('finds matching tag and advances cursor', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span><p></p>';
      startHydration(root);

      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.tagName).toBe('SPAN');

      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.tagName).toBe('P');
    });

    it('skips non-matching elements (browser extensions)', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span>';
      // Inject a fake browser extension node before the span
      const extension = document.createElement('grammarly-extension');
      root.insertBefore(extension, root.firstChild);
      startHydration(root);

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.tagName).toBe('SPAN');
      expect(debugSpy).toHaveBeenCalledWith(
        '[hydrate] Skipping non-matching node: <grammarly-extension> (expected <span>)',
      );
      debugSpy.mockRestore();
    });

    it('returns null when no match found (with dev warning)', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span>';
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = claimElement('article');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        '[hydrate] Expected <article> but no matching SSR node found. Creating new element.',
      );
      warnSpy.mockRestore();
    });
  });

  describe('claimText', () => {
    it('finds text node and advances cursor', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('hello'));
      root.appendChild(document.createElement('span'));
      startHydration(root);

      const text = claimText();
      expect(text).not.toBeNull();
      expect(text?.data).toBe('hello');
    });

    it('skips element nodes', () => {
      const root = document.createElement('div');
      root.appendChild(document.createElement('span'));
      root.appendChild(document.createTextNode('world'));
      startHydration(root);

      const text = claimText();
      expect(text).not.toBeNull();
      expect(text?.data).toBe('world');
    });

    it('returns null when no text node found', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span>';
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = claimText();
      expect(result).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('claimComment', () => {
    it('finds comment node and advances cursor', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('conditional'));
      root.appendChild(document.createElement('span'));
      startHydration(root);

      const comment = claimComment();
      expect(comment).not.toBeNull();
      expect(comment?.data).toBe('conditional');
    });

    it('skips non-comment nodes', () => {
      const root = document.createElement('div');
      root.appendChild(document.createElement('span'));
      root.appendChild(document.createComment('anchor'));
      startHydration(root);

      const comment = claimComment();
      expect(comment).not.toBeNull();
      expect(comment?.data).toBe('anchor');
    });

    it('returns null when no comment node found', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span>';
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = claimComment();
      expect(result).toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('enterChildren / exitChildren', () => {
    it('pushes cursor into element children', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><span>inner</span></div>';
      startHydration(root);

      const div = claimElement('div')!;
      expect(div).not.toBeNull();

      enterChildren(div);
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.tagName).toBe('SPAN');
    });

    it('restores parent cursor position on exit', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><span></span></div><p></p>';
      startHydration(root);

      const div = claimElement('div')!;
      enterChildren(div);
      claimElement('span');
      exitChildren();

      // Cursor should be back at the parent level, after the div
      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.tagName).toBe('P');
    });

    it('maintains correct stack depth with nesting', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><ul><li>item</li></ul></div><footer></footer>';
      startHydration(root);

      const div = claimElement('div')!;
      enterChildren(div);

      const ul = claimElement('ul')!;
      enterChildren(ul);

      const li = claimElement('li')!;
      expect(li.tagName).toBe('LI');

      exitChildren(); // back to div's children level
      exitChildren(); // back to root level

      const footer = claimElement('footer');
      expect(footer).not.toBeNull();
      expect(footer?.tagName).toBe('FOOTER');
    });
  });

  describe('empty elements', () => {
    it('enterChildren/exitChildren works on elements with no children', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div></div><span>after</span>';
      startHydration(root);

      const div = claimElement('div')!;
      expect(div).not.toBeNull();

      // Enter empty div — cursor set to null (no children)
      enterChildren(div);
      // Exit — restore to root-level siblings
      exitChildren();

      // Should be able to claim next sibling
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.tagName).toBe('SPAN');
    });
  });

  describe('concurrent hydration guard', () => {
    it('throws if startHydration is called while already hydrating', () => {
      const root1 = document.createElement('div');
      const root2 = document.createElement('div');
      startHydration(root1);

      expect(() => startHydration(root2)).toThrow(/already active/);
    });
  });
});
