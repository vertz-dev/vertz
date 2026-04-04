/**
 * E2E acceptance test for form-level onChange with per-input debounce (#2151).
 *
 * Uses only public package imports to verify the developer experience.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { __formOnChange } from '@vertz/ui/internals';
import type { FormValues } from '@vertz/ui';

// ── Helpers ──────────────────────────────────────────────────────────────

function createForm(): HTMLFormElement {
  const form = document.createElement('form');
  document.body.appendChild(form);
  return form;
}

function createInput(
  name: string,
  opts?: { debounce?: number; value?: string },
): HTMLInputElement {
  const el = document.createElement('input');
  el.name = name;
  if (opts?.debounce) el.setAttribute('data-vertz-debounce', String(opts.debounce));
  if (opts?.value) el.value = opts.value;
  return el;
}

function createSelect(name: string, options: string[]): HTMLSelectElement {
  const el = document.createElement('select');
  el.name = name;
  for (const value of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    el.appendChild(opt);
  }
  el.value = options[0];
  return el;
}

function typeInput(el: HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function changeSelect(el: HTMLSelectElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function tick(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Feature: Form-level onChange with per-input debounce (E2E)', () => {
  let form: HTMLFormElement;
  let cleanupFn: (() => void) | null;

  beforeEach(() => {
    form = createForm();
    cleanupFn = null;
  });

  afterEach(() => {
    cleanupFn?.();
    form.remove();
  });

  describe('Given a search form with debounced text + immediate select', () => {
    it('fires handler with all form values when select changes immediately', async () => {
      const handler = mock((_values: FormValues) => {});
      const searchInput = createInput('q', { debounce: 300, value: '' });
      const statusSelect = createSelect('status', ['all', 'active', 'done']);
      form.appendChild(searchInput);
      form.appendChild(statusSelect);

      cleanupFn = __formOnChange(form, handler);

      changeSelect(statusSelect, 'active');
      await tick();

      expect(handler).toHaveBeenCalledTimes(1);
      const values = handler.mock.calls[0][0];
      expect(values.status).toBe('active');
      expect(values.q).toBe('');
    });
  });

  describe('Given rapid typing in a debounced input', () => {
    it('coalesces multiple keystrokes into one callback after debounce', async () => {
      const handler = mock((_values: FormValues) => {});
      const searchInput = createInput('q', { debounce: 300 });
      form.appendChild(searchInput);

      cleanupFn = __formOnChange(form, handler);

      typeInput(searchInput, 'h');
      typeInput(searchInput, 'he');
      typeInput(searchInput, 'hel');
      typeInput(searchInput, 'hello');

      // Nothing fires immediately — all debounced
      await tick();
      expect(handler).toHaveBeenCalledTimes(0);

      // After debounce period
      await new Promise((resolve) => setTimeout(resolve, 350));
      await tick();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].q).toBe('hello');
    });
  });

  describe('Given a debounced input then an immediate select change', () => {
    it('fires once with both values (pending timer canceled by flush)', async () => {
      const handler = mock((_values: FormValues) => {});
      const searchInput = createInput('q', { debounce: 300 });
      const statusSelect = createSelect('status', ['all', 'active', 'done']);
      form.appendChild(searchInput);
      form.appendChild(statusSelect);

      cleanupFn = __formOnChange(form, handler);

      // Type in debounced input (starts a timer)
      typeInput(searchInput, 'test');
      // Immediately change the select (triggers non-debounced flush)
      changeSelect(statusSelect, 'done');
      await tick();

      // One callback with both values
      expect(handler).toHaveBeenCalledTimes(1);
      const values = handler.mock.calls[0][0];
      expect(values.q).toBe('test');
      expect(values.status).toBe('done');

      // Wait past the original debounce — no extra callback
      await new Promise((resolve) => setTimeout(resolve, 350));
      await tick();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given form.reset() is called', () => {
    it('fires handler with reset values', async () => {
      const handler = mock((_values: FormValues) => {});
      const nameInput = createInput('name', { value: 'Alice' });
      form.appendChild(nameInput);

      cleanupFn = __formOnChange(form, handler);

      form.reset();
      await tick();

      expect(handler).toHaveBeenCalledTimes(1);
      // After reset, value is empty string (default)
      expect(handler.mock.calls[0][0].name).toBe('');
    });
  });

  describe('Given cleanup is called', () => {
    it('does not fire handler after cleanup', async () => {
      const handler = mock((_values: FormValues) => {});
      const nameInput = createInput('name');
      form.appendChild(nameInput);

      cleanupFn = __formOnChange(form, handler);
      cleanupFn();
      cleanupFn = null; // prevent double cleanup in afterEach

      typeInput(nameInput, 'hello');
      await tick();

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Given FormValues type safety', () => {
    it('handler receives FormValues with string-indexed string values', async () => {
      const received: FormValues[] = [];
      const handler = (values: FormValues) => {
        received.push(values);
      };
      const nameInput = createInput('name');
      const emailInput = createInput('email');
      form.appendChild(nameInput);
      form.appendChild(emailInput);

      cleanupFn = __formOnChange(form, handler);

      typeInput(nameInput, 'Alice');
      typeInput(emailInput, 'alice@example.com');
      await tick();

      expect(received).toHaveLength(1);
      const values: FormValues = received[0];
      expect(typeof values.name).toBe('string');
      expect(typeof values.email).toBe('string');
      expect(values.name).toBe('Alice');
      expect(values.email).toBe('alice@example.com');
    });
  });
});
