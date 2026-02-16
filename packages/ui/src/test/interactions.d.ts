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
export declare function click(el: Element): Promise<void>;
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
export declare function type(el: Element | string, text: string): Promise<void>;
/**
 * Simulate a keyboard key press.
 *
 * Dispatches `keydown` followed by `keyup` on the currently active
 * element (or `document.body` if nothing is focused).
 */
export declare function press(key: string): Promise<void>;
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
export declare function fillForm(
  formEl: HTMLFormElement,
  data: Record<string, string>,
): Promise<void>;
/**
 * Trigger form submission by dispatching a `submit` event.
 *
 * The event bubbles and is cancelable, matching browser behavior.
 * Test handlers can call `event.preventDefault()` to prevent default
 * form navigation.
 *
 * @throws {TypeError} If `formEl` is not an `HTMLFormElement`.
 */
export declare function submitForm(formEl: HTMLFormElement): Promise<void>;
//# sourceMappingURL=interactions.d.ts.map
