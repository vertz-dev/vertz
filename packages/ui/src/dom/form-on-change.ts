import { _tryOnCleanup } from '../runtime/disposal';
import { formDataToObject } from '../form/form-data';

/** Point-in-time snapshot of form values collected via FormData. */
export interface FormValues {
  [key: string]: string;
}

/**
 * Wire up form-level onChange with per-input debounce.
 *
 * - Listens to `input` events on the form via delegation (covers all form
 *   elements per HTML Living Standard: text inputs, textareas, selects,
 *   checkboxes, radios).
 * - Listens to `reset` events to detect form.reset().
 * - Reads `data-vertz-debounce` from the event target to determine delay.
 * - Non-debounced events are coalesced via microtask batching.
 * - An immediate flush cancels all pending debounce timers (their values
 *   are already included in the flush).
 *
 * During SSR, this is a no-op (event listeners are not functional on the
 * DOM shim).
 *
 * Compiler output target for `<form onChange={handler}>`.
 */
export function __formOnChange(
  form: HTMLFormElement,
  handler: (values: FormValues) => void,
): () => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let pendingFlush = false;

  function collectValues(): FormValues {
    return formDataToObject(new FormData(form)) as FormValues;
  }

  function flush(): void {
    pendingFlush = false;
    // Cancel all pending debounce timers — their values are included in this flush
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    handler(collectValues());
  }

  function scheduleFlush(): void {
    if (!pendingFlush) {
      pendingFlush = true;
      queueMicrotask(flush);
    }
  }

  function handleInput(e: Event): void {
    const target = e.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement) &&
      !(target instanceof HTMLSelectElement)
    ) {
      return;
    }
    const name = target.name;
    if (!name) return;

    const debounceAttr = target.getAttribute('data-vertz-debounce');
    const debounceMs = debounceAttr ? parseInt(debounceAttr, 10) : 0;

    if (debounceMs > 0) {
      const existing = timers.get(name);
      if (existing != null) clearTimeout(existing);
      timers.set(name, setTimeout(scheduleFlush, debounceMs));
    } else {
      scheduleFlush();
    }
  }

  function handleReset(): void {
    // reset event fires before values are cleared — flush on next microtask
    scheduleFlush();
  }

  form.addEventListener('input', handleInput);
  form.addEventListener('reset', handleReset);

  const cleanup = () => {
    form.removeEventListener('input', handleInput);
    form.removeEventListener('reset', handleReset);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };

  _tryOnCleanup(cleanup);
  return cleanup;
}
