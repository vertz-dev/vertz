import { afterEach, describe, expect, it, vi } from 'bun:test';
import {
  claimComment,
  claimElement,
  claimText,
  endHydration,
  enterChildren,
  exitChildren,
  getIsHydrating,
  pauseHydration,
  resumeHydration,
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

    it('stops at element nodes instead of skipping past them', () => {
      const root = document.createElement('div');
      root.appendChild(document.createElement('span'));
      root.appendChild(document.createTextNode('world'));
      startHydration(root);

      // claimText should NOT skip past the <span> to reach "world"
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const text = claimText();
      expect(text).toBeNull();
      warnSpy.mockRestore();

      // The <span> is still claimable
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.tagName).toBe('SPAN');

      // Now "world" text is claimable
      const text2 = claimText();
      expect(text2).not.toBeNull();
      expect(text2?.data).toBe('world');
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

    it('stops at element nodes so subsequent claimElement can find them', () => {
      // Reproduces the Counter hydration bug (historical — __child now uses
      // comment markers instead of span wrappers, but the cursor behavior
      // tested here is still relevant for any element boundary).
      // Bug: second claimText skipped past the <span>, making claimElement return null.
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('Page Views:'));
      const span = document.createElement('span');
      span.style.display = 'contents';
      span.textContent = '0';
      root.appendChild(span);

      startHydration(root);

      // First claimText claims the merged text node
      const text1 = claimText();
      expect(text1).not.toBeNull();
      expect(text1?.data).toBe('Page Views:');

      // Second claimText for ":" — no text node at cursor, cursor is at <span>
      // Should return null WITHOUT consuming the <span>
      const text2 = claimText();
      expect(text2).toBeNull();

      // claimElement('span') must still find the <span> — cursor was NOT advanced past it
      const claimed = claimElement('span');
      expect(claimed).not.toBeNull();
      expect(claimed).toBe(span);
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

  describe('exitChildren bounds checking', () => {
    it('warns in dev mode when called with empty stack', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div></div>';
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      exitChildren(); // No matching enterChildren — stack is empty
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('exitChildren() called with empty stack'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('endHydration dev warnings', () => {
    it('emits debug when unclaimed nodes remain', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span><p></p>';
      startHydration(root);

      // Claim only the first node, leaving <p> unclaimed
      claimElement('span');

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      endHydration();
      expect(debugSpy).toHaveBeenCalledWith(
        '[hydrate] Hydration ended with unclaimed nodes remaining. ' +
          'This may indicate SSR/client tree mismatch or browser extension nodes.',
      );
      debugSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('emits debug when cursor stack is unbalanced', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><span></span></div>';
      startHydration(root);

      const div = claimElement('div')!;
      enterChildren(div);
      // Do NOT call exitChildren — stack is unbalanced

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      endHydration();
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('unbalanced cursor stack (depth: 1)'),
      );
      debugSpy.mockRestore();
    });

    it('no debug output when hydration ends cleanly', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span>';
      startHydration(root);

      // Claim all nodes
      claimElement('span');

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      endHydration();
      expect(debugSpy).not.toHaveBeenCalled();
      debugSpy.mockRestore();
    });
  });

  describe('claim verification', () => {
    it('no warning when all nodes claimed', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span><p></p>';
      startHydration(root);

      claimElement('span');
      claimElement('p');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      endHydration();

      // No unclaimed-node warnings
      const claimWarns = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('not claimed'),
      );
      expect(claimWarns).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it('reports unclaimed element nodes', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span><p></p>';
      startHydration(root);

      // Claim only <span>, leave <p> unclaimed
      claimElement('span');

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      endHydration();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/1 SSR node\(s\) not claimed/));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('<p>'));

      debugSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('skips CSR content after claimed <!--child--> comment anchor', () => {
      const root = document.createElement('div');
      // Simulate SSR with a __child comment: <!--child--><p>csr-content</p>
      const comment = document.createComment('child');
      root.appendChild(comment);
      const p = document.createElement('p');
      p.textContent = 'csr-content';
      root.appendChild(p);
      startHydration(root);

      // Claim the comment anchor (as __child would)
      claimComment();

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      endHydration();

      // <p> after the claimed <!--child--> comment should NOT trigger an unclaimed warning
      // — it's CSR-managed content
      const claimWarns = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('not claimed'),
      );
      expect(claimWarns).toHaveLength(0);

      warnSpy.mockRestore();
    });

    it('skips browser extension nodes (custom elements)', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span>';
      // Inject a browser extension node
      root.appendChild(document.createElement('grammarly-extension'));
      startHydration(root);

      claimElement('span');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      endHydration();

      // grammarly-extension should NOT trigger an unclaimed warning
      const claimWarns = warnSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('not claimed'),
      );
      expect(claimWarns).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe('claim cursor restoration on failure', () => {
    it('claimElement restores cursor when no matching tag is found', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div id="target"></div><p></p>';
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      // Try to claim a <span> — doesn't exist. Should fail without corrupting cursor.
      const span = claimElement('span');
      expect(span).toBeNull();

      // Cursor should still be at <div id="target"> — NOT exhausted to null.
      const div = claimElement('div');
      expect(div).not.toBeNull();
      expect(div?.id).toBe('target');

      warnSpy.mockRestore();
      debugSpy.mockRestore();
    });

    it('claimElement restores cursor after scanning past non-matching elements', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div></div><p></p><section></section>';
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      // Try to claim a <span> — not present. claimElement scans all siblings.
      const span = claimElement('span');
      expect(span).toBeNull();

      // Cursor should be restored — all three elements still claimable.
      const div = claimElement('div');
      expect(div).not.toBeNull();
      expect(div?.tagName).toBe('DIV');

      warnSpy.mockRestore();
      debugSpy.mockRestore();
    });

    it('claimText restores cursor when comment nodes precede an element', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('anchor'));
      root.appendChild(document.createElement('span'));
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Try to claim text — only comment + element exist. Should fail without corruption.
      const text = claimText();
      expect(text).toBeNull();

      // Comment should still be claimable (cursor restored before the comment)
      const comment = claimComment();
      expect(comment).not.toBeNull();
      expect(comment?.data).toBe('anchor');

      warnSpy.mockRestore();
    });

    it('claimComment restores cursor when no comment node is found', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span><p></p>';
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      // Try to claim a comment — doesn't exist. Should fail without corrupting cursor.
      const comment = claimComment();
      expect(comment).toBeNull();

      // Cursor should still be at <span> — NOT exhausted to null.
      const span = claimElement('span');
      expect(span).not.toBeNull();
      expect(span?.tagName).toBe('SPAN');

      warnSpy.mockRestore();
      debugSpy.mockRestore();
    });

    it('failed claims inside enterChildren/exitChildren do not corrupt parent cursor', () => {
      // Simulates the composed primitive pattern:
      // Parent has <div role="radiogroup"><div role="radio">...</div></div>
      // Child component tries to claim <span> inside the radiogroup (for slot markers)
      // The failed claim should not break the parent's ability to claim subsequent elements.
      const root = document.createElement('div');
      root.innerHTML = '<div role="radiogroup"><div role="radio"></div></div><footer></footer>';
      startHydration(root);

      const radiogroup = claimElement('div')!;
      expect(radiogroup).not.toBeNull();
      enterChildren(radiogroup);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      // Slot marker tries to claim <span> inside radiogroup — only <div role="radio"> exists
      const span = claimElement('span');
      expect(span).toBeNull();

      // The <div role="radio"> should still be claimable after the failed span claim
      const radio = claimElement('div');
      expect(radio).not.toBeNull();
      expect(radio?.getAttribute('role')).toBe('radio');

      exitChildren();

      // Parent-level cursor should be intact — <footer> is claimable
      const footer = claimElement('footer');
      expect(footer).not.toBeNull();
      expect(footer?.tagName).toBe('FOOTER');

      warnSpy.mockRestore();
      debugSpy.mockRestore();
    });
  });

  describe('slot scanning pattern during hydration', () => {
    it('resolveChildren + failed claims do not corrupt cursor for the return JSX', () => {
      // This simulates the composed primitive pattern:
      // 1. SSR produces: <div role="radiogroup"><div role="radio">A</div><div role="radio">B</div></div>
      // 2. During hydration, resolveChildren creates slot marker <span> elements
      // 3. Slot markers try claimElement('span') — fails (SSR has <div>)
      // 4. After slot scanning, the return JSX claims the actual <div role="radiogroup">
      //
      // Before the fix, step 3 exhausted the cursor, making step 4 fail.
      const root = document.createElement('div');
      root.innerHTML =
        '<div role="radiogroup">' +
        '<div role="radio">A</div>' +
        '<div role="radio">B</div>' +
        '</div>';
      startHydration(root);

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Step 1: Simulate resolveChildren — children thunk creates slot markers
      // Each slot marker calls __element('span') → claimElement('span') → fails
      const marker1 = claimElement('span');
      expect(marker1).toBeNull(); // No <span> in SSR — correct
      const marker2 = claimElement('span');
      expect(marker2).toBeNull(); // No <span> in SSR — correct

      // Step 2: After slot scanning, the return JSX claims the actual structure
      const radiogroup = claimElement('div');
      expect(radiogroup).not.toBeNull();
      expect(radiogroup?.getAttribute('role')).toBe('radiogroup');

      // Step 3: Enter children and claim radio items
      enterChildren(radiogroup!);

      const radio1 = claimElement('div');
      expect(radio1).not.toBeNull();
      expect(radio1?.getAttribute('role')).toBe('radio');
      expect(radio1?.textContent).toBe('A');

      const radio2 = claimElement('div');
      expect(radio2).not.toBeNull();
      expect(radio2?.getAttribute('role')).toBe('radio');
      expect(radio2?.textContent).toBe('B');

      exitChildren();

      debugSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('nested failed claims with enterChildren/exitChildren preserve cursor stack', () => {
      // Simulates a more complex scenario: composed component inside another component.
      // Parent SSR: <main><div role="tablist">...</div><footer>...</footer></main>
      // The tab component's slot resolution creates failed <span> claims inside <main>.
      const root = document.createElement('div');
      root.innerHTML =
        '<main>' +
        '<div role="tablist"><button role="tab">Tab 1</button></div>' +
        '<div role="tabpanel">Content 1</div>' +
        '</main>' +
        '<footer></footer>';
      startHydration(root);

      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Claim <main>
      const main = claimElement('main');
      expect(main).not.toBeNull();
      enterChildren(main!);

      // Simulate slot marker resolution — creates <span> markers that fail to claim
      expect(claimElement('span')).toBeNull();
      expect(claimElement('span')).toBeNull();

      // After failed claims, the actual tablist structure should still be claimable
      const tablist = claimElement('div');
      expect(tablist).not.toBeNull();
      expect(tablist?.getAttribute('role')).toBe('tablist');

      enterChildren(tablist!);
      const tab = claimElement('button');
      expect(tab).not.toBeNull();
      expect(tab?.getAttribute('role')).toBe('tab');
      exitChildren();

      const panel = claimElement('div');
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute('role')).toBe('tabpanel');

      exitChildren(); // exit <main>

      // Parent-level cursor should be intact — <footer> is claimable
      const footer = claimElement('footer');
      expect(footer).not.toBeNull();

      debugSpy.mockRestore();
      warnSpy.mockRestore();
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

  describe('pauseHydration / resumeHydration', () => {
    it('pauseHydration sets isHydrating to false', () => {
      const root = document.createElement('div');
      startHydration(root);
      expect(getIsHydrating()).toBe(true);

      pauseHydration();
      expect(getIsHydrating()).toBe(false);
    });

    it('resumeHydration restores isHydrating to true', () => {
      const root = document.createElement('div');
      startHydration(root);

      pauseHydration();
      expect(getIsHydrating()).toBe(false);

      resumeHydration();
      expect(getIsHydrating()).toBe(true);
    });

    it('preserves cursor position across pause/resume', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span><p></p>';
      startHydration(root);

      // Claim first element to advance cursor
      claimElement('span');

      // Pause and resume — cursor should stay at <p>
      pauseHydration();
      resumeHydration();

      const p = claimElement('p');
      expect(p).not.toBeNull();
      expect(p?.tagName).toBe('P');
    });
  });
});
