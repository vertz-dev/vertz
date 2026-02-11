/**
 * User interaction simulation utilities for testing Vertz UI components.
 *
 * Dispatches real DOM events so that event listeners set up with `__on`
 * (or plain addEventListener) fire as they would in a browser.
 */

/**
 * Simulate a mouse click on the given element.
 *
 * Dispatches a `click` MouseEvent that bubbles and is cancelable,
 * matching browser behavior.
 */
export async function click(el: Element): Promise<void> {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  // Yield a microtask so any async handlers / signal effects settle.
  await Promise.resolve();
}

/**
 * Simulate typing text into an input or textarea element.
 *
 * Sets the element's `value` property, then dispatches `input` and
 * `change` events so that reactive bindings (signal-based or native)
 * pick up the new value.
 *
 * If `el` is a string it is treated as a CSS selector resolved against
 * `document`.
 */
export async function type(el: Element | string, text: string): Promise<void> {
  const target = typeof el === 'string' ? document.querySelector(el) : el;
  if (!target) {
    throw new TypeError(
      `type: element not found${typeof el === 'string' ? ` for selector "${el}"` : ''}`,
    );
  }

  if (!isInputLike(target)) {
    throw new TypeError('type: element is not an <input> or <textarea>');
  }

  // Set value directly (mirrors real user input).
  (target as HTMLInputElement).value = text;

  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));

  await Promise.resolve();
}

/**
 * Simulate a keyboard key press.
 *
 * Dispatches `keydown` followed by `keyup` on the currently active
 * element (or `document.body` if nothing is focused).
 */
export async function press(key: string): Promise<void> {
  const target = document.activeElement ?? document.body;

  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));

  await Promise.resolve();
}

function isInputLike(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea';
}
