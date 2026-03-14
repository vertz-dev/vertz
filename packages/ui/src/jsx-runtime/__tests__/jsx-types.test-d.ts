// Type tests for JSX runtime - compile-time assertions
// These should compile without errors if types are correct

import { Fragment, jsx, jsxDEV } from '../index';

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

// --- Category A: Components that should be usable as JSX ---

// Outlet returns HTMLElement
import { Outlet } from '../../router/outlet';

void (jsx(Outlet, {}) satisfies HTMLElement);

// NOTE: OAuthButton, Avatar, ProtectedRoute, AuthGate, AccessGate, UserName, UserAvatar
// have moved to @vertz/ui-auth. Type tests for those live in packages/ui-auth/.

// --- Category C: Transparent return wrappers ---

// Suspense returns HTMLElement | SVGElement | DocumentFragment (JSX.Element)
import { Suspense } from '../../component/suspense';

void jsx(Suspense, {
  children: () => jsx('div', {}),
  fallback: () => jsx('div', {}),
});

// ErrorBoundary returns HTMLElement | SVGElement | DocumentFragment (JSX.Element)
import { ErrorBoundary } from '../../component/error-boundary';

void jsx(ErrorBoundary, {
  children: () => jsx('div', {}),
  fallback: (_e: Error, _r: () => void) => jsx('div', {}),
});

// --- Negative tests: components returning wrong types should NOT compile ---

// @ts-expect-error — component returning string is not a valid JSX component
void jsx((_props: Record<string, unknown>) => 'hello', {});
