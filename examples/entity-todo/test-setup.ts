/**
 * Test setup for bun test with happy-dom
 */
import { GlobalWindow } from 'happy-dom';

// Create a happy-dom window and inject globals
const window = new GlobalWindow();
const document = window.document;

// Inject DOM globals into the global scope for bun test
// @ts-expect-error - Injecting DOM globals
globalThis.window = window;
// @ts-expect-error - Injecting DOM globals
globalThis.document = document;
// @ts-expect-error - Injecting DOM globals
globalThis.HTMLElement = window.HTMLElement;
// @ts-expect-error - Injecting DOM globals
globalThis.Element = window.Element;
// @ts-expect-error - Injecting DOM globals
globalThis.Node = window.Node;
// @ts-expect-error - Injecting DOM globals
globalThis.NodeList = window.NodeList;
// @ts-expect-error - Injecting DOM globals
globalThis.NodeFilter = window.NodeFilter;
// @ts-expect-error - Injecting DOM globals
globalThis.MouseEvent = window.MouseEvent;
// @ts-expect-error - Injecting DOM globals
globalThis.KeyboardEvent = window.KeyboardEvent;
// @ts-expect-error - Injecting DOM globals
globalThis.Event = window.Event;
// @ts-expect-error - Injecting DOM globals
globalThis.navigator = window.navigator;
// @ts-expect-error - Injecting DOM globals
globalThis.location = window.location;
// @ts-expect-error - Injecting DOM globals — native FormData can't read happy-dom forms
globalThis.FormData = window.FormData;
