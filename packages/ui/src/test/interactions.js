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
export async function click(el) {
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
export async function type(el, text) {
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
  target.value = text;
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
export async function press(key) {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
  await Promise.resolve();
}
/**
 * Fill form fields by name with the provided values.
 *
 * Looks up each key in `data` as a form element `[name="<key>"]` inside
 * the given `<form>` and sets its value. Dispatches `input` and `change`
 * events on each field so reactive bindings pick up the new values.
 *
 * Supported element types:
 * - `<input>` (text, email, password, etc.) — sets `.value`
 * - `<input type="checkbox">` — sets `.checked` (`"true"` / `"false"`)
 * - `<input type="radio">` — checks the radio whose `.value` matches
 * - `<textarea>` — sets `.value`
 * - `<select>` — sets `.value`
 *
 * @throws {TypeError} If `formEl` is not an `HTMLFormElement`.
 * @throws {TypeError} If a named field in `data` does not exist in the form.
 */
export async function fillForm(formEl, data) {
  if (!(formEl instanceof HTMLFormElement)) {
    throw new TypeError('fillForm: first argument must be an <form> element');
  }
  for (const [name, value] of Object.entries(data)) {
    const elements = formEl.querySelectorAll(`[name="${name}"]`);
    if (elements.length === 0) {
      throw new TypeError(`fillForm: no element found with name "${name}" in the form`);
    }
    const first = elements[0];
    // Handle radio buttons: find the radio with the matching value and check it
    if (first instanceof HTMLInputElement && first.type === 'radio') {
      let matched = false;
      for (const el of elements) {
        if (el instanceof HTMLInputElement && el.type === 'radio') {
          const shouldCheck = el.value === value;
          el.checked = shouldCheck;
          if (shouldCheck) {
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            matched = true;
          }
        }
      }
      if (!matched) {
        throw new TypeError(`fillForm: no radio button with name "${name}" has value "${value}"`);
      }
      continue;
    }
    // Handle checkbox inputs
    if (first instanceof HTMLInputElement && first.type === 'checkbox') {
      first.checked = value === 'true';
      first.dispatchEvent(new Event('input', { bubbles: true }));
      first.dispatchEvent(new Event('change', { bubbles: true }));
      continue;
    }
    // Handle select elements
    if (first instanceof HTMLSelectElement) {
      first.value = value;
      first.dispatchEvent(new Event('input', { bubbles: true }));
      first.dispatchEvent(new Event('change', { bubbles: true }));
      continue;
    }
    // Handle text inputs and textareas
    if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
      first.value = value;
      first.dispatchEvent(new Event('input', { bubbles: true }));
      first.dispatchEvent(new Event('change', { bubbles: true }));
      continue;
    }
    throw new TypeError(`fillForm: element with name "${name}" is not a supported form field type`);
  }
  // Yield a microtask so any async handlers / signal effects settle.
  await Promise.resolve();
}
/**
 * Trigger form submission by dispatching a `submit` event.
 *
 * The event bubbles and is cancelable, matching browser behavior.
 * Test handlers can call `event.preventDefault()` to prevent default
 * form navigation.
 *
 * @throws {TypeError} If `formEl` is not an `HTMLFormElement`.
 */
export async function submitForm(formEl) {
  if (!(formEl instanceof HTMLFormElement)) {
    throw new TypeError('submitForm: argument must be a <form> element');
  }
  formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  // Yield a microtask so any async handlers / signal effects settle.
  await Promise.resolve();
}
function isInputLike(el) {
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea';
}
//# sourceMappingURL=interactions.js.map
