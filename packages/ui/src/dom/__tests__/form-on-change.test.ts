import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
import type { DisposeFn } from '../../runtime/signal-types';
import { __formOnChange, type FormValues } from '../form-on-change';

/**
 * Helper: create a <form> with children and wire up __formOnChange.
 */
function createForm(
  children: HTMLElement[],
  handler: (values: FormValues) => void,
): { form: HTMLFormElement; cleanup: () => void } {
  const form = document.createElement('form');
  for (const child of children) form.appendChild(child);
  const cleanup = __formOnChange(form, handler);
  return { form, cleanup };
}

function input(name: string, opts?: { debounce?: number; value?: string; type?: string }): HTMLInputElement {
  const el = document.createElement('input');
  el.name = name;
  if (opts?.type) el.type = opts.type;
  if (opts?.value !== undefined) el.value = opts.value;
  if (opts?.debounce !== undefined) {
    el.setAttribute('data-vertz-debounce', String(opts.debounce));
  }
  return el;
}

function select(name: string, options: string[], selected?: string): HTMLSelectElement {
  const el = document.createElement('select');
  el.name = name;
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    el.appendChild(option);
  }
  if (selected) el.value = selected;
  return el;
}

function textarea(name: string, opts?: { debounce?: number; value?: string }): HTMLTextAreaElement {
  const el = document.createElement('textarea');
  el.name = name;
  if (opts?.value !== undefined) el.value = opts.value;
  if (opts?.debounce !== undefined) {
    el.setAttribute('data-vertz-debounce', String(opts.debounce));
  }
  return el;
}

function fireInput(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function fireReset(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('reset', { bubbles: true }));
}

/** Flush pending microtasks. */
async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe('__formOnChange', () => {
  let scope: DisposeFn[];

  beforeEach(() => {
    scope = pushScope();
  });

  afterEach(() => {
    runCleanups(scope);
    popScope();
  });

  // ── Non-debounced inputs ──────────────────────────────────────

  describe('Given a form with non-debounced inputs', () => {
    it('fires handler with all form values on next microtask after input event', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'hello' });
      const status = select('status', ['all', 'active'], 'all');
      createForm([q, status], spy);

      fireInput(q);

      // Not called synchronously
      expect(spy).not.toHaveBeenCalled();

      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toEqual({ q: 'hello', status: 'all' });
    });

    it('coalesces multiple input events in the same tick into one handler call', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'a' });
      const status = select('status', ['all', 'active'], 'all');
      createForm([q, status], spy);

      fireInput(q);
      q.value = 'ab';
      fireInput(q);
      q.value = 'abc';
      fireInput(q);

      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toEqual({ q: 'abc', status: 'all' });
    });

    it('fires for select changes', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: '' });
      const status = select('status', ['all', 'active'], 'all');
      createForm([q, status], spy);

      status.value = 'active';
      fireInput(status);

      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toEqual({ q: '', status: 'active' });
    });
  });

  // ── Debounced inputs ──────────────────────────────────────────

  describe('Given a form with debounced inputs', () => {
    it('does NOT fire handler immediately for debounced input', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'hello', debounce: 300 });
      createForm([q], spy);

      fireInput(q);

      await flushMicrotasks();

      expect(spy).not.toHaveBeenCalled();
    });

    it('fires handler after debounce period', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'hello', debounce: 50 });
      createForm([q], spy);

      fireInput(q);

      // Wait for debounce
      await new Promise((r) => setTimeout(r, 60));
      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toEqual({ q: 'hello' });
    });

    it('resets debounce timer on rapid typing (fires once after final keystroke)', async () => {
      const spy = mock(() => {});
      const q = input('q', { debounce: 50 });
      createForm([q], spy);

      q.value = 'h';
      fireInput(q);
      await new Promise((r) => setTimeout(r, 20));

      q.value = 'he';
      fireInput(q);
      await new Promise((r) => setTimeout(r, 20));

      q.value = 'hel';
      fireInput(q);

      // Wait for full debounce from last keystroke
      await new Promise((r) => setTimeout(r, 60));
      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toEqual({ q: 'hel' });
    });
  });

  // ── Mixed: debounced + non-debounced ──────────────────────────

  describe('Given mixed debounced and non-debounced inputs', () => {
    it('fires immediately for non-debounced input and cancels pending debounce timers', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'hel', debounce: 300 });
      const status = select('status', ['all', 'active'], 'all');
      createForm([q, status], spy);

      // Type in debounced input (starts 300ms timer)
      fireInput(q);

      // Immediately change the select (non-debounced)
      status.value = 'active';
      fireInput(status);

      await flushMicrotasks();

      // Handler fires once with all current values
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toEqual({ q: 'hel', status: 'active' });

      // Wait past the original debounce period — should NOT fire again
      await new Promise((r) => setTimeout(r, 350));
      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ── form.reset() ──────────────────────────────────────────────

  describe('Given form.reset() is called', () => {
    it('fires handler with reset values', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'hello' });
      createForm([q], spy);

      fireReset(q.closest('form')!);

      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
      // After reset, input value reverts to default (empty for inputs without defaultValue)
      expect(spy.mock.calls[0]![0]).toHaveProperty('q');
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────

  describe('Given cleanup is called', () => {
    it('removes event listeners so handler no longer fires', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'test' });
      const { cleanup } = createForm([q], spy);

      cleanup();

      fireInput(q);
      await flushMicrotasks();

      expect(spy).not.toHaveBeenCalled();
    });

    it('clears pending debounce timers', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'test', debounce: 50 });
      const { cleanup } = createForm([q], spy);

      fireInput(q);
      cleanup();

      // Wait past debounce period
      await new Promise((r) => setTimeout(r, 60));
      await flushMicrotasks();

      expect(spy).not.toHaveBeenCalled();
    });

    it('does not fire handler when cleanup is called after scheduleFlush but before microtask runs', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'hello' });
      const { cleanup } = createForm([q], spy);

      // Fire input → schedules a microtask flush
      fireInput(q);
      // Cleanup before the microtask runs
      cleanup();
      // Now let the microtask execute — handler should NOT fire
      await flushMicrotasks();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ── Edge cases ────────────────────────────────────────────────

  describe('Given event target has no name attribute', () => {
    it('does not fire handler', async () => {
      const spy = mock(() => {});
      const unnamed = document.createElement('input');
      // No name attribute set
      const { form } = createForm([unnamed], spy);

      unnamed.dispatchEvent(new Event('input', { bubbles: true }));
      await flushMicrotasks();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Given event target is not a form element', () => {
    it('does not fire handler for div', async () => {
      const spy = mock(() => {});
      const div = document.createElement('div');
      const { form } = createForm([], spy);
      form.appendChild(div);

      div.dispatchEvent(new Event('input', { bubbles: true }));
      await flushMicrotasks();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('Given debounce={0} explicitly set', () => {
    it('fires immediately (0 treated as no debounce)', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'test', debounce: 0 });
      createForm([q], spy);

      fireInput(q);
      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Given a checkbox inside the form', () => {
    it('includes checked checkbox value in FormValues', async () => {
      const spy = mock(() => {});
      const checkbox = input('terms', { type: 'checkbox' });
      checkbox.checked = true;
      createForm([checkbox], spy);

      fireInput(checkbox);
      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
      const values = spy.mock.calls[0]![0] as FormValues;
      expect(values.terms).toBeDefined();
    });

    it('excludes unchecked checkbox key from FormValues', async () => {
      const spy = mock(() => {});
      const checkbox = input('terms', { type: 'checkbox' });
      checkbox.checked = false;
      createForm([checkbox], spy);

      // Need another input to trigger the event
      const trigger = input('other', { value: 'x' });
      const { form } = createForm([checkbox, trigger], spy);

      fireInput(trigger);
      await flushMicrotasks();

      // spy was called from the second createForm
      const calls = spy.mock.calls;
      const lastCall = calls[calls.length - 1]![0] as FormValues;
      expect(lastCall.terms).toBeUndefined();
    });
  });

  // ── Disposal scope integration ────────────────────────────────

  describe('Given a disposal scope', () => {
    it('registers cleanup with the scope and cleans up on scope disposal', async () => {
      const spy = mock(() => {});
      const q = input('q', { value: 'test' });

      const innerScope = pushScope();
      createForm([q], spy);
      popScope();

      fireInput(q);
      await flushMicrotasks();
      expect(spy).toHaveBeenCalledTimes(1);

      // Dispose the scope
      runCleanups(innerScope);

      spy.mockClear();
      fireInput(q);
      await flushMicrotasks();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ── Textarea support ──────────────────────────────────────────

  describe('Given a textarea with debounce', () => {
    it('debounces textarea input events', async () => {
      const spy = mock(() => {});
      const desc = textarea('desc', { value: 'hello', debounce: 50 });
      createForm([desc], spy);

      fireInput(desc);

      await flushMicrotasks();
      expect(spy).not.toHaveBeenCalled();

      await new Promise((r) => setTimeout(r, 60));
      await flushMicrotasks();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0]![0]).toEqual({ desc: 'hello' });
    });
  });
});
