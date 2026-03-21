import { _tryOnCleanup } from '../runtime/disposal';

/**
 * Bind an event handler to an element.
 * Returns a cleanup function to remove the listener.
 *
 * Registers the cleanup with the current disposal scope (if any) so that
 * event listeners are automatically removed when the owning component or
 * dialog is unmounted. Without this, listeners on dynamically-mounted
 * elements (e.g., forms inside useDialogStack dialogs) would leak.
 *
 * Compiler output target for event bindings (onClick, onInput, etc.).
 */
export function __on(el: HTMLElement, event: string, handler: EventListener): () => void {
  el.addEventListener(event, handler);
  const cleanup = () => el.removeEventListener(event, handler);
  _tryOnCleanup(cleanup);
  return cleanup;
}
