/**
 * Type-level tests: __element() should return specific HTML element types
 * based on the tag name, matching the jsx() runtime overloads.
 */
import { __element } from '../element';

// --- Positive: specific element types ---

const div = __element('div');
void (div satisfies HTMLDivElement);

const form = __element('form');
void (form satisfies HTMLFormElement);

const input = __element('input');
void (input satisfies HTMLInputElement);

const button = __element('button');
void (button satisfies HTMLButtonElement);

const a = __element('a');
void (a satisfies HTMLAnchorElement);

const img = __element('img');
void (img satisfies HTMLImageElement);

const span = __element('span');
void (span satisfies HTMLSpanElement);

const select = __element('select');
void (select satisfies HTMLSelectElement);

const textarea = __element('textarea');
void (textarea satisfies HTMLTextAreaElement);

// --- With props ---

const divWithProps = __element('div', { class: 'foo', role: 'button' });
void (divWithProps satisfies HTMLDivElement);

// --- Negative: wrong element type should fail ---

const form2 = __element('form');
// @ts-expect-error — <form> returns HTMLFormElement, not HTMLInputElement
void (form2 satisfies HTMLInputElement);

// --- Unknown tags fall back to HTMLElement ---

const custom = __element('my-widget');
void (custom satisfies HTMLElement);
