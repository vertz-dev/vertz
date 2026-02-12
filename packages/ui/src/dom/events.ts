/**
 * Bind an event handler to an element.
 * Returns a cleanup function to remove the listener.
 *
 * Compiler output target for event bindings (onClick, onInput, etc.).
 */
export function __on(el: HTMLElement, event: string, handler: EventListener): () => void {
  el.addEventListener(event, handler);
  return () => el.removeEventListener(event, handler);
}
