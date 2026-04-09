import { afterAll, beforeAll, describe, expect, it } from '@vertz/test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { captureDOMState, restoreDOMState } from '../bun-plugin/fast-refresh-dom-state';

beforeAll(() => {
  GlobalRegistrator.register({ url: 'http://localhost/' });
});
afterAll(() => {
  GlobalRegistrator.unregister();
});

describe('fast-refresh-dom-state', () => {
  describe('infrastructure', () => {
    it('can import and call captureDOMState on an empty element', () => {
      const el = document.createElement('div');
      const snapshot = captureDOMState(el);
      expect(snapshot).toBeDefined();
      expect(snapshot.formFields.size).toBe(0);
      expect(snapshot.focus).toBeNull();
      expect(snapshot.scrollPositions).toHaveLength(0);
    });

    it('restoreDOMState on an empty snapshot is a no-op', () => {
      const el = document.createElement('div');
      const snapshot = captureDOMState(el);
      // Should not throw
      restoreDOMState(el, snapshot);
    });
  });

  describe('form field preservation', () => {
    it('captures input text values keyed by name', () => {
      const el = document.createElement('div');
      el.innerHTML = '<input name="title" value="Hello" /><input name="desc" value="World" />';

      // Simulate user typing (setting .value doesn't reflect in getAttribute)
      const title = el.querySelector('[name="title"]') as HTMLInputElement;
      const desc = el.querySelector('[name="desc"]') as HTMLInputElement;
      title.value = 'Hello';
      desc.value = 'World';

      const snapshot = captureDOMState(el);
      expect(snapshot.formFields.size).toBe(2);
      expect(snapshot.formFields.get('name:title')?.value).toBe('Hello');
      expect(snapshot.formFields.get('name:desc')?.value).toBe('World');
    });

    it('captures checkbox checked state by name', () => {
      const el = document.createElement('div');
      el.innerHTML = '<input type="checkbox" name="agree" />';
      const cb = el.querySelector('[name="agree"]') as HTMLInputElement;
      cb.checked = true;

      const snapshot = captureDOMState(el);
      expect(snapshot.formFields.get('name:agree')?.checked).toBe(true);
    });

    it('captures select selectedIndex by name', () => {
      const el = document.createElement('div');
      el.innerHTML = '<select name="status"><option>open</option><option>closed</option></select>';
      const select = el.querySelector('[name="status"]') as HTMLSelectElement;
      select.selectedIndex = 1;

      const snapshot = captureDOMState(el);
      expect(snapshot.formFields.get('name:status')?.selectedIndex).toBe(1);
    });

    it('captures textarea values by name', () => {
      const el = document.createElement('div');
      el.innerHTML = '<textarea name="body"></textarea>';
      const ta = el.querySelector('[name="body"]') as HTMLTextAreaElement;
      ta.value = 'Some text content';

      const snapshot = captureDOMState(el);
      expect(snapshot.formFields.get('name:body')?.value).toBe('Some text content');
    });

    it('restores input text value to matching name in new tree', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = '<input name="title" />';
      (oldEl.querySelector('[name="title"]') as HTMLInputElement).value = 'Preserved';

      const snapshot = captureDOMState(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = '<input name="title" />';
      restoreDOMState(newEl, snapshot);

      expect((newEl.querySelector('[name="title"]') as HTMLInputElement).value).toBe('Preserved');
    });

    it('restores checkbox, select, and textarea by name', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = `
        <input type="checkbox" name="agree" />
        <select name="status"><option>open</option><option>closed</option></select>
        <textarea name="body"></textarea>
      `;
      (oldEl.querySelector('[name="agree"]') as HTMLInputElement).checked = true;
      (oldEl.querySelector('[name="status"]') as HTMLSelectElement).selectedIndex = 1;
      (oldEl.querySelector('[name="body"]') as HTMLTextAreaElement).value = 'Notes';

      const snapshot = captureDOMState(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = `
        <input type="checkbox" name="agree" />
        <select name="status"><option>open</option><option>closed</option></select>
        <textarea name="body"></textarea>
      `;
      restoreDOMState(newEl, snapshot);

      expect((newEl.querySelector('[name="agree"]') as HTMLInputElement).checked).toBe(true);
      expect((newEl.querySelector('[name="status"]') as HTMLSelectElement).selectedIndex).toBe(1);
      expect((newEl.querySelector('[name="body"]') as HTMLTextAreaElement).value).toBe('Notes');
    });

    it('captures inputs without name attribute using positional fallback', () => {
      const el = document.createElement('div');
      el.innerHTML = '<input value="nameless" /><input name="named" value="yes" />';
      (el.querySelector('input:first-child') as HTMLInputElement).value = 'nameless';
      (el.querySelector('[name="named"]') as HTMLInputElement).value = 'yes';

      const snapshot = captureDOMState(el);
      expect(snapshot.formFields.size).toBe(2);
      expect(snapshot.formFields.has('name:named')).toBe(true);
      expect(snapshot.formFields.has('pos:input:0')).toBe(true);
    });

    it('skips silently when name exists in old tree but not new tree', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = '<input name="removed" value="gone" />';
      (oldEl.querySelector('[name="removed"]') as HTMLInputElement).value = 'gone';

      const snapshot = captureDOMState(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = '<input name="different" />';
      // Should not throw
      restoreDOMState(newEl, snapshot);
      expect((newEl.querySelector('[name="different"]') as HTMLInputElement).value).toBe('');
    });

    it('skips file inputs', () => {
      const el = document.createElement('div');
      el.innerHTML = '<input type="file" name="upload" /><input name="text" value="ok" />';
      (el.querySelector('[name="text"]') as HTMLInputElement).value = 'ok';

      const snapshot = captureDOMState(el);
      expect(snapshot.formFields.size).toBe(1);
      expect(snapshot.formFields.has('name:upload')).toBe(false);
      expect(snapshot.formFields.has('name:text')).toBe(true);
    });
  });

  describe('focus preservation', () => {
    it('captures focused element by name attribute', () => {
      const el = document.createElement('div');
      el.innerHTML = '<input name="title" /><input name="desc" />';
      document.body.appendChild(el);

      const input = el.querySelector('[name="title"]') as HTMLInputElement;
      input.focus();

      const snapshot = captureDOMState(el);
      expect(snapshot.focus).not.toBeNull();
      expect(snapshot.focus?.matchKey).toBe('title');
      expect(snapshot.focus?.matchBy).toBe('name');

      document.body.removeChild(el);
    });

    it('captures focused element by id when name is absent', () => {
      const el = document.createElement('div');
      el.innerHTML = '<button id="submit-btn">Submit</button>';
      document.body.appendChild(el);

      const btn = el.querySelector('#submit-btn') as HTMLButtonElement;
      btn.focus();

      const snapshot = captureDOMState(el);
      expect(snapshot.focus).not.toBeNull();
      expect(snapshot.focus?.matchKey).toBe('submit-btn');
      expect(snapshot.focus?.matchBy).toBe('id');

      document.body.removeChild(el);
    });

    it('captures selectionStart/selectionEnd for focused input', () => {
      const el = document.createElement('div');
      el.innerHTML = '<input name="title" />';
      document.body.appendChild(el);

      const input = el.querySelector('[name="title"]') as HTMLInputElement;
      input.value = 'Hello World';
      input.focus();
      input.setSelectionRange(2, 5);

      const snapshot = captureDOMState(el);
      expect(snapshot.focus?.selectionStart).toBe(2);
      expect(snapshot.focus?.selectionEnd).toBe(5);

      document.body.removeChild(el);
    });

    it('restores focus to element with matching name in new tree', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = '<input name="title" /><input name="desc" />';
      document.body.appendChild(oldEl);

      const oldInput = oldEl.querySelector('[name="desc"]') as HTMLInputElement;
      oldInput.focus();

      const snapshot = captureDOMState(oldEl);
      document.body.removeChild(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = '<input name="title" /><input name="desc" />';
      document.body.appendChild(newEl);

      restoreDOMState(newEl, snapshot);

      const focused = document.activeElement;
      expect(focused).toBe(newEl.querySelector('[name="desc"]'));

      document.body.removeChild(newEl);
    });

    it('restores selection range after focus', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = '<input name="title" />';
      document.body.appendChild(oldEl);

      const oldInput = oldEl.querySelector('[name="title"]') as HTMLInputElement;
      oldInput.value = 'Hello World';
      oldInput.focus();
      oldInput.setSelectionRange(3, 7);

      const snapshot = captureDOMState(oldEl);
      document.body.removeChild(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = '<input name="title" />';
      document.body.appendChild(newEl);

      const newInput = newEl.querySelector('[name="title"]') as HTMLInputElement;
      newInput.value = 'Hello World';

      restoreDOMState(newEl, snapshot);

      expect(newInput.selectionStart).toBe(3);
      expect(newInput.selectionEnd).toBe(7);

      document.body.removeChild(newEl);
    });

    it('returns null focus when activeElement is outside the component tree', () => {
      const el = document.createElement('div');
      el.innerHTML = '<input name="title" />';
      document.body.appendChild(el);

      // Focus something outside the component tree
      const outside = document.createElement('input');
      document.body.appendChild(outside);
      outside.focus();

      const snapshot = captureDOMState(el);
      expect(snapshot.focus).toBeNull();

      document.body.removeChild(el);
      document.body.removeChild(outside);
    });

    it('skips focus restore when matching element is disabled', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = '<input name="title" />';
      document.body.appendChild(oldEl);

      (oldEl.querySelector('[name="title"]') as HTMLInputElement).focus();

      const snapshot = captureDOMState(oldEl);
      document.body.removeChild(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = '<input name="title" disabled />';
      document.body.appendChild(newEl);

      restoreDOMState(newEl, snapshot);

      // Focus should NOT be on the disabled element
      expect(document.activeElement).not.toBe(newEl.querySelector('[name="title"]'));

      document.body.removeChild(newEl);
    });
  });

  describe('scroll position preservation', () => {
    it('captures scrollTop/scrollLeft on elements with id and non-zero scroll', () => {
      const el = document.createElement('div');
      el.innerHTML = '<div id="content" style="overflow:auto; height:100px;"></div>';

      const scrollable = el.querySelector('#content') as HTMLDivElement;
      // happy-dom may not fully support scroll, but we set the property directly
      Object.defineProperty(scrollable, 'scrollTop', { value: 42, writable: true });
      Object.defineProperty(scrollable, 'scrollLeft', { value: 10, writable: true });

      const snapshot = captureDOMState(el);
      expect(snapshot.scrollPositions).toHaveLength(1);
      expect(snapshot.scrollPositions[0].matchKey).toBe('content');
      expect(snapshot.scrollPositions[0].matchBy).toBe('id');
      expect(snapshot.scrollPositions[0].scrollTop).toBe(42);
      expect(snapshot.scrollPositions[0].scrollLeft).toBe(10);
    });

    it('restores scroll positions by id in new tree', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = '<div id="content"></div>';
      const oldScrollable = oldEl.querySelector('#content') as HTMLDivElement;
      Object.defineProperty(oldScrollable, 'scrollTop', { value: 100, writable: true });
      Object.defineProperty(oldScrollable, 'scrollLeft', { value: 50, writable: true });

      const snapshot = captureDOMState(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = '<div id="content"></div>';
      restoreDOMState(newEl, snapshot);

      const newScrollable = newEl.querySelector('#content') as HTMLDivElement;
      expect(newScrollable.scrollTop).toBe(100);
      expect(newScrollable.scrollLeft).toBe(50);
    });

    it('captures by tagName + className when no id', () => {
      const el = document.createElement('div');
      el.innerHTML = '<div class="panel scrollable"></div>';
      const scrollable = el.querySelector('.panel') as HTMLDivElement;
      Object.defineProperty(scrollable, 'scrollTop', { value: 30, writable: true });

      const snapshot = captureDOMState(el);
      expect(snapshot.scrollPositions).toHaveLength(1);
      expect(snapshot.scrollPositions[0].matchBy).toBe('selector');
      expect(snapshot.scrollPositions[0].matchKey).toBe('div.panel scrollable');
    });

    it('skips restore silently when no matching element found', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = '<div id="old-panel"></div>';
      const scrollable = oldEl.querySelector('#old-panel') as HTMLDivElement;
      Object.defineProperty(scrollable, 'scrollTop', { value: 50, writable: true });

      const snapshot = captureDOMState(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = '<div id="new-panel"></div>';
      // Should not throw
      restoreDOMState(newEl, snapshot);
    });
  });

  describe('integration: full refresh cycle', () => {
    it('preserves form values + focus through capture/replace/restore', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = `
        <form>
          <input name="title" />
          <textarea name="body"></textarea>
          <input type="checkbox" name="urgent" />
        </form>
      `;
      document.body.appendChild(oldEl);

      (oldEl.querySelector('[name="title"]') as HTMLInputElement).value = 'My Task';
      (oldEl.querySelector('[name="body"]') as HTMLTextAreaElement).value = 'Details here';
      (oldEl.querySelector('[name="urgent"]') as HTMLInputElement).checked = true;
      (oldEl.querySelector('[name="title"]') as HTMLInputElement).focus();

      const snapshot = captureDOMState(oldEl);

      // Simulate replaceChild
      const newEl = document.createElement('div');
      newEl.innerHTML = `
        <form>
          <input name="title" />
          <textarea name="body"></textarea>
          <input type="checkbox" name="urgent" />
        </form>
      `;
      oldEl.parentNode?.replaceChild(newEl, oldEl);

      restoreDOMState(newEl, snapshot);

      expect((newEl.querySelector('[name="title"]') as HTMLInputElement).value).toBe('My Task');
      expect((newEl.querySelector('[name="body"]') as HTMLTextAreaElement).value).toBe(
        'Details here',
      );
      expect((newEl.querySelector('[name="urgent"]') as HTMLInputElement).checked).toBe(true);
      expect(document.activeElement).toBe(newEl.querySelector('[name="title"]'));

      document.body.removeChild(newEl);
    });

    it('preserves state when DOM has conditional comment anchors', () => {
      // Simulates Vertz __conditional inserting comment nodes that shift child indices
      const oldEl = document.createElement('div');
      oldEl.innerHTML = `
        <!-- conditional -->
        <span style="display:contents">Status: open</span>
        <input name="title" />
        <!-- conditional -->
        <span style="display:contents">Count: 3</span>
        <input name="desc" />
      `;
      (oldEl.querySelector('[name="title"]') as HTMLInputElement).value = 'Preserved Title';
      (oldEl.querySelector('[name="desc"]') as HTMLInputElement).value = 'Preserved Desc';

      const snapshot = captureDOMState(oldEl);

      // New tree has different comment/span positions (structural shift)
      const newEl = document.createElement('div');
      newEl.innerHTML = `
        <!-- conditional -->
        <span style="display:contents">Status: closed</span>
        <!-- conditional -->
        <input name="title" />
        <span style="display:contents">Count: 5</span>
        <input name="desc" />
        <!-- conditional -->
      `;
      restoreDOMState(newEl, snapshot);

      // Name-based matching is immune to structural shifts
      expect((newEl.querySelector('[name="title"]') as HTMLInputElement).value).toBe(
        'Preserved Title',
      );
      expect((newEl.querySelector('[name="desc"]') as HTMLInputElement).value).toBe(
        'Preserved Desc',
      );
    });

    it('handles partial restore when new tree is missing some fields', () => {
      const oldEl = document.createElement('div');
      oldEl.innerHTML = `
        <input name="title" />
        <input name="removed-field" />
        <input name="desc" />
      `;
      (oldEl.querySelector('[name="title"]') as HTMLInputElement).value = 'Keep';
      (oldEl.querySelector('[name="removed-field"]') as HTMLInputElement).value = 'Gone';
      (oldEl.querySelector('[name="desc"]') as HTMLInputElement).value = 'Also Keep';

      const snapshot = captureDOMState(oldEl);

      const newEl = document.createElement('div');
      newEl.innerHTML = `
        <input name="title" />
        <input name="desc" />
      `;
      // Should not throw even though 'removed-field' doesn't exist
      restoreDOMState(newEl, snapshot);

      expect((newEl.querySelector('[name="title"]') as HTMLInputElement).value).toBe('Keep');
      expect((newEl.querySelector('[name="desc"]') as HTMLInputElement).value).toBe('Also Keep');
    });

    it('capture/restore is resilient to DOM errors', () => {
      // Capture on a valid tree
      const el = document.createElement('div');
      el.innerHTML = '<input name="title" />';
      (el.querySelector('[name="title"]') as HTMLInputElement).value = 'test';

      const snapshot = captureDOMState(el);

      // Restore on an empty tree — should not throw
      const emptyEl = document.createElement('div');
      restoreDOMState(emptyEl, snapshot);
    });
  });
});
