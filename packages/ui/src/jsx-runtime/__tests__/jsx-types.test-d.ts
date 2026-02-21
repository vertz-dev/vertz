// Type tests for JSX runtime - compile-time assertions
// These should compile without errors if types are correct

import { jsx, Fragment, jsxDEV } from '../index';

// Test that jsx returns the correct element types for intrinsic elements
// Using void to avoid unused variable warnings

// div returns HTMLDivElement
void (jsx('div', {}) satisfies HTMLDivElement);

// form returns HTMLFormElement
void (jsx('form', {}) satisfies HTMLFormElement);

// input returns HTMLInputElement
void (jsx('input', {}) satisfies HTMLInputElement);

// button returns HTMLButtonElement
void (jsx('button', {}) satisfies HTMLButtonElement);

// span returns HTMLSpanElement
void (jsx('span', {}) satisfies HTMLSpanElement);

// a returns HTMLAnchorElement
void (jsx('a', {}) satisfies HTMLAnchorElement);

// img returns HTMLImageElement
void (jsx('img', {}) satisfies HTMLImageElement);

// p returns HTMLParagraphElement
void (jsx('p', {}) satisfies HTMLParagraphElement);

// Test with props
void (jsx('div', { id: 'test', class: 'container' }) satisfies HTMLDivElement);
void (jsx('input', { type: 'text', value: 'hello' }) satisfies HTMLInputElement);

// Test component function - component returns HTMLDivElement so jsx should return HTMLDivElement
const MyComponent = (props: { name: string }) => jsx('div', { children: props.name });
void (jsx(MyComponent, { name: 'test' }) satisfies HTMLDivElement);

// Test Fragment returns DocumentFragment
void (Fragment({ children: 'test' }) satisfies DocumentFragment);
void (jsx(Fragment, { children: 'test' }) satisfies DocumentFragment);

// Test jsxDEV
void (jsxDEV('div', {}) satisfies HTMLDivElement);
