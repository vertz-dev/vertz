import { afterEach, describe, expect, it, vi } from 'bun:test';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { signal } from '../../runtime/signal';
import {
  __append,
  __child,
  __element,
  __enterChildren,
  __exitChildren,
  __insert,
  __staticText,
  __text,
} from '../element';
import { __on } from '../events';

describe('DOM helpers — hydration branches', () => {
  afterEach(() => {
    endHydration();
  });

  describe('__element', () => {
    it('adopts existing element during hydration', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div></div>';
      const existingDiv = root.firstChild as HTMLElement;
      startHydration(root);

      const el = __element('div');
      expect(el).toBe(existingDiv);
    });

    it('warns on ARIA attribute mismatch during hydration', () => {
      const root = document.createElement('div');
      const div = document.createElement('div');
      div.setAttribute('aria-hidden', 'true');
      root.appendChild(div);
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      __element('div', { 'aria-hidden': 'false' });
      expect(warnSpy).toHaveBeenCalledWith(
        '[hydrate] ARIA mismatch on <div>: aria-hidden="true" (expected "false")',
      );
      warnSpy.mockRestore();
    });

    it('warns on role mismatch during hydration', () => {
      const root = document.createElement('div');
      const div = document.createElement('div');
      div.setAttribute('role', 'button');
      root.appendChild(div);
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      __element('div', { role: 'link' });
      expect(warnSpy).toHaveBeenCalledWith(
        '[hydrate] ARIA mismatch on <div>: role="button" (expected "link")',
      );
      warnSpy.mockRestore();
    });

    it('does not warn on non-ARIA attribute mismatch during hydration', () => {
      const root = document.createElement('div');
      const div = document.createElement('div');
      div.setAttribute('class', 'old');
      root.appendChild(div);
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      __element('div', { class: 'new' });
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('does not warn when ARIA attributes match during hydration', () => {
      const root = document.createElement('div');
      const div = document.createElement('div');
      div.setAttribute('aria-hidden', 'true');
      div.setAttribute('role', 'button');
      root.appendChild(div);
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      __element('div', { 'aria-hidden': 'true', role: 'button' });
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('creates new element when claim fails (fallback)', () => {
      const root = document.createElement('div');
      root.innerHTML = '<span></span>';
      startHydration(root);

      const el = __element('article');
      expect(el.tagName).toBe('ARTICLE');
      // Not the existing span
      expect(el).not.toBe(root.firstChild);
    });

    it('skips browser extension elements', () => {
      const root = document.createElement('div');
      const extension = document.createElement('grammarly-extension');
      const target = document.createElement('div');
      root.appendChild(extension);
      root.appendChild(target);
      startHydration(root);

      const el = __element('div');
      expect(el).toBe(target);
    });
  });

  describe('__text', () => {
    it('adopts existing text node during hydration', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('Count: 0'));
      const existingText = root.firstChild as Text;
      startHydration(root);

      const count = signal(0);
      const node = __text(() => `Count: ${count.value}`);
      expect(node).toBe(existingText);
    });

    it('attaches reactive effect to adopted text node', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('Count: 0'));
      startHydration(root);

      const count = signal(0);
      const node = __text(() => `Count: ${count.value}`);

      // After effect runs, data should match
      expect(node.data).toBe('Count: 0');

      // Reactive updates should work
      endHydration();
      count.value = 5;
      expect(node.data).toBe('Count: 5');
    });
  });

  describe('__child', () => {
    it('claims comment anchor during hydration', () => {
      const root = document.createElement('div');
      // SSR output: <!--child-->hello
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('hello'));
      const existingComment = root.firstChild as Comment;
      startHydration(root);

      const result = __child(() => 'hello');
      // Result should be the claimed comment node
      expect(result).toBe(existingComment);
    });

    it('falls back to CSR when no comment to claim during hydration', () => {
      const root = document.createElement('div');
      // Only a text node, no comment to claim
      root.appendChild(document.createTextNode('just text'));
      startHydration(root);

      const result = __child(() => 'fallback');
      // Should have created a new fragment with comment anchor
      expect(result.textContent).toBe('fallback');
    });

    it('attaches reactive effect to claimed comment anchor', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('hello'));
      startHydration(root);

      const text = signal('hello');
      const result = __child(() => text.value);

      // Reactive update after hydration ends
      endHydration();
      text.value = 'world';
      // Content after the comment should be updated
      expect((result as Comment).nextSibling?.textContent).toBe('world');
    });

    it('clears SSR content after comment and re-renders via CSR during hydration', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('ssr-content'));
      startHydration(root);

      const result = __child(() => 'csr-content');
      // SSR text should be replaced with CSR-rendered content
      expect((result as Comment).nextSibling?.textContent).toBe('csr-content');
    });

    it('renders Node children via CSR during hydration (not claimed from SSR)', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('child'));
      const ssrChild = document.createElement('article');
      ssrChild.textContent = 'ssr';
      root.appendChild(ssrChild);
      startHydration(root);

      const csrChild = document.createElement('article');
      csrChild.textContent = 'csr';
      const result = __child(() => csrChild);
      // Should contain the CSR-created node, not the SSR one
      expect((result as Comment).nextSibling).toBe(csrChild);
    });

    it('event handlers on CSR-rendered children work during hydration', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('placeholder'));
      startHydration(root);

      let clicked = false;
      const button = document.createElement('button');
      button.textContent = 'click me';
      button.addEventListener('click', () => {
        clicked = true;
      });
      const result = __child(() => button);

      // The button should be the CSR-created one with the event handler
      const btn = (result as Comment).nextSibling as HTMLElement;
      expect(btn).toBe(button);
      btn.click();
      expect(clicked).toBe(true);
    });

    it('hydration cursor advances past comment for siblings after __child()', () => {
      const root = document.createElement('div');
      // SSR output: <!--child-->child text<p>sibling</p>
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('child'));
      const p = document.createElement('p');
      p.textContent = 'sibling';
      root.appendChild(p);
      startHydration(root);

      __child(() => 'child');

      // Cursor should have advanced past the comment — next claim should find <p>
      const claimed = __element('p');
      expect(claimed).not.toBeNull();
      expect(claimed.tagName).toBe('P');
    });

    it('reactive updates work after hydration on CSR-rendered children', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('initial'));
      startHydration(root);

      const text = signal('hello');
      const result = __child(() => text.value);
      expect((result as Comment).nextSibling?.textContent).toBe('hello');

      // End hydration and trigger reactive update
      endHydration();
      text.value = 'updated';
      expect((result as Comment).nextSibling?.textContent).toBe('updated');
    });

    it('ref and getElementById point to same element after hydration (#1517)', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('placeholder'));
      document.body.appendChild(root);

      startHydration(root);

      const dialogRef: { current: HTMLElement | undefined } = { current: undefined };
      __child(() => {
        const dialog = document.createElement('dialog');
        dialog.id = 'test-dlg';
        dialogRef.current = dialog;
        return dialog;
      });

      endHydration();

      // ref.current should be the CSR-created element, now in the DOM
      expect(dialogRef.current).toBeDefined();
      expect(dialogRef.current?.isConnected).toBe(true);
      // ref and getElementById should agree
      expect(document.getElementById('test-dlg')).toBe(dialogRef.current);

      document.body.removeChild(root);
    });

    it('JSX event handlers fire on CSR element inside __child (#1517)', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('placeholder'));
      document.body.appendChild(root);

      startHydration(root);

      let clicked = false;
      const result = __child(() => {
        const btn = document.createElement('button');
        btn.id = 'test-btn';
        btn.textContent = 'Click';
        __on(btn, 'click', () => {
          clicked = true;
        });
        return btn;
      });

      endHydration();

      // The CSR button is in the DOM and has the event handler
      const btn = (result as Comment).nextSibling as HTMLElement;
      expect(btn.isConnected).toBe(true);
      btn.click();
      expect(clicked).toBe(true);

      document.body.removeChild(root);
    });

    it('preserves static text between adjacent __child expressions (#1812)', () => {
      const root = document.createElement('div');
      // Simulated SSR output with end markers:
      // <span>Showing 1–<!--child-->1<!--/child--> of <!--child-->1<!--/child--> items</span>
      const span = document.createElement('span');
      span.appendChild(document.createTextNode('Showing 1\u2013'));
      span.appendChild(document.createComment('child'));
      span.appendChild(document.createTextNode('1'));
      span.appendChild(document.createComment('/child'));
      span.appendChild(document.createTextNode(' of '));
      span.appendChild(document.createComment('child'));
      span.appendChild(document.createTextNode('1'));
      span.appendChild(document.createComment('/child'));
      span.appendChild(document.createTextNode(' items'));
      root.appendChild(span);
      startHydration(root);

      // Simulate compiled output for:
      // <span>Showing 1–{Math.min(20, total)} of {total} items</span>
      const el = __element('span');
      __enterChildren(el);
      __append(el, __staticText('Showing 1\u2013'));
      __append(
        el,
        __child(() => '1'),
      );
      __append(el, __staticText(' of '));
      __append(
        el,
        __child(() => '1'),
      );
      __append(el, __staticText(' items'));
      __exitChildren();

      endHydration();

      expect(el.textContent).toBe('Showing 1\u20131 of 1 items');
    });

    it('handles adjacent __child expressions without static text between them (#1812)', () => {
      const root = document.createElement('div');
      // SSR: <span><!--child-->A<!--/child--><!--child-->B<!--/child--></span>
      const span = document.createElement('span');
      span.appendChild(document.createComment('child'));
      span.appendChild(document.createTextNode('A'));
      span.appendChild(document.createComment('/child'));
      span.appendChild(document.createComment('child'));
      span.appendChild(document.createTextNode('B'));
      span.appendChild(document.createComment('/child'));
      root.appendChild(span);
      startHydration(root);

      const el = __element('span');
      __enterChildren(el);
      __append(
        el,
        __child(() => 'A'),
      );
      __append(
        el,
        __child(() => 'B'),
      );
      __exitChildren();

      endHydration();

      expect(el.textContent).toBe('AB');
    });

    it('handles __child as last child with end marker (#1812)', () => {
      const root = document.createElement('div');
      // SSR: <span>Total: <!--child-->42<!--/child--></span>
      const span = document.createElement('span');
      span.appendChild(document.createTextNode('Total: '));
      span.appendChild(document.createComment('child'));
      span.appendChild(document.createTextNode('42'));
      span.appendChild(document.createComment('/child'));
      root.appendChild(span);
      startHydration(root);

      const el = __element('span');
      __enterChildren(el);
      __append(el, __staticText('Total: '));
      __append(
        el,
        __child(() => '42'),
      );
      __exitChildren();

      endHydration();

      expect(el.textContent).toBe('Total: 42');
    });

    it('CSR path includes end marker in fragment (#1812)', () => {
      // Not hydrating — pure CSR
      const result = __child(() => 'content');
      // Fragment should contain: <!--child-->, "content", <!--/child-->
      const nodes = Array.from((result as unknown as DocumentFragment).childNodes);
      expect(nodes.length).toBe(3);
      expect(nodes[0]!.nodeType).toBe(8); // Comment
      expect((nodes[0] as Comment).data).toBe('child');
      expect(nodes[1]!.textContent).toBe('content');
      expect(nodes[2]!.nodeType).toBe(8); // Comment
      expect((nodes[2] as Comment).data).toBe('/child');
    });

    it('warns when __child claims a non-child comment during hydration', () => {
      const root = document.createElement('div');
      // Only a non-child comment — __child will claim it but warn
      root.appendChild(document.createComment('conditional'));
      startHydration(root);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      __child(() => 'text');
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('__child expected <!--child--> but claimed <!--conditional-->'),
      );
      warnSpy.mockRestore();
    });

    it('clears nested <!--child--> markers from SSR content (#1853)', () => {
      // Simulates the SSR output of a composed component (e.g., ComposedButton)
      // that receives children through __child, which themselves contain
      // nested __child markers for reactive text:
      //   <button><!--child-->Theme: <!--child-->0<!--/child--><!--/child--></button>
      const root = document.createElement('div');
      const outer = document.createComment('child');
      root.appendChild(outer);
      root.appendChild(document.createTextNode('Theme: '));
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('0'));
      root.appendChild(document.createComment('/child'));
      root.appendChild(document.createComment('/child'));
      startHydration(root);

      const s = signal(0);
      const result = __child(() => ['Theme: ', s.value]);
      endHydration();

      // The anchor should be followed by CSR-rendered content only.
      // The stale SSR nested <!--child-->0<!--/child--> must be removed.
      const anchor = result as Comment;
      expect(root.textContent).toBe('Theme: 0');

      // Verify no stale "0" text node from SSR remains
      const allText = Array.from(root.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n as Text).data);
      expect(allText).toEqual(['Theme: ', '0']);

      // Reactive update should show correct value, not "10" (stale + new)
      s.value = 1;
      expect(root.textContent).toBe('Theme: 1');
    });

    it('dispose cleans up effects on hydrated __child', () => {
      const root = document.createElement('div');
      root.appendChild(document.createComment('child'));
      root.appendChild(document.createTextNode('initial'));
      root.appendChild(document.createComment('/child'));
      startHydration(root);

      const s = signal('hello');
      const result = __child(() => s.value);
      endHydration();

      // Verify initial content
      expect((result as Comment).nextSibling?.textContent).toBe('hello');

      // Dispose should stop reactive updates
      (result as unknown as { dispose: () => void }).dispose();
      s.value = 'updated';
      expect((result as Comment).nextSibling?.textContent).toBe('hello');
    });
  });

  describe('__insert', () => {
    it('no-op for Node values during hydration', () => {
      const root = document.createElement('div');
      const child = document.createElement('span');
      root.appendChild(child);
      startHydration(root);

      // Should not append or throw — node already in DOM
      __insert(root, child);
      expect(root.childNodes.length).toBe(1);
    });

    it('adopts text node for string values during hydration', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('static text'));
      startHydration(root);

      __insert(root, 'static text');
      // No new nodes created
      expect(root.childNodes.length).toBe(1);
    });
  });

  describe('__append', () => {
    it('no-op during hydration', () => {
      const root = document.createElement('div');
      startHydration(root);

      const child = document.createElement('span');
      __append(root, child);
      // Should NOT have appended
      expect(root.childNodes.length).toBe(0);
    });

    it('calls appendChild during CSR', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      __append(parent, child);
      expect(parent.firstChild).toBe(child);
    });
  });

  describe('__staticText', () => {
    it('claims existing text node during hydration', () => {
      const root = document.createElement('div');
      root.appendChild(document.createTextNode('hello'));
      const existingText = root.firstChild as Text;
      startHydration(root);

      const text = __staticText('hello');
      expect(text).toBe(existingText);
    });

    it('creates new text node during CSR', () => {
      const text = __staticText('hello');
      expect(text.data).toBe('hello');
    });

    it('creates new text node when claim fails during hydration', () => {
      const root = document.createElement('div');
      // Only an element node, no text nodes to claim
      root.innerHTML = '<span></span>';
      startHydration(root);

      const text = __staticText('fallback');
      // Should have created a new text node since no text node was found
      expect(text.data).toBe('fallback');
      expect(text).not.toBe(root.firstChild);
    });
  });

  describe('__enterChildren / __exitChildren', () => {
    it('manages hydration cursor for nested elements', () => {
      const root = document.createElement('div');
      root.innerHTML = '<div><span></span></div><p></p>';
      startHydration(root);

      const div = __element('div');
      __enterChildren(div);
      const span = __element('span');
      expect(span.tagName).toBe('SPAN');
      __exitChildren();

      const p = __element('p');
      expect(p.tagName).toBe('P');
    });

    it('no-op during CSR', () => {
      const el = document.createElement('div');
      // Should not throw during CSR
      __enterChildren(el);
      __exitChildren();
    });
  });

  describe('CSR behavior unchanged', () => {
    it('all existing __element behavior works in CSR', () => {
      const el = __element('div');
      expect(el.tagName).toBe('DIV');
    });

    it('all existing __text behavior works in CSR', () => {
      const name = signal('world');
      const node = __text(() => `hello ${name.value}`);
      expect(node.data).toBe('hello world');
      name.value = 'vertz';
      expect(node.data).toBe('hello vertz');
    });

    it('all existing __child behavior works in CSR', () => {
      const parent = document.createElement('div');
      const result = __child(() => 'test');
      parent.appendChild(result);
      // Comment anchor + text content
      expect(parent.childNodes[0].nodeType).toBe(8); // Comment
      expect(parent.textContent).toBe('test');
    });

    it('all existing __insert behavior works in CSR', () => {
      const parent = document.createElement('div');
      __insert(parent, 'text');
      expect(parent.textContent).toBe('text');
    });
  });
});
