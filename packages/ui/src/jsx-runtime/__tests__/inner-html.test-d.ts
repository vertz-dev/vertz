import type { trusted } from '../../trusted-html';
import type { JSX } from '../index';

// Positive: HTMLAttributes supports innerHTML
const validString: JSX.HTMLAttributes = { innerHTML: '<b>x</b>' };
void validString;

// Positive: HTMLAttributes supports TrustedHTML
type TrustedHTMLType = ReturnType<typeof trusted>;
const validTrusted: JSX.HTMLAttributes = { innerHTML: null as unknown as TrustedHTMLType };
void validTrusted;

// Positive: null/undefined allowed
const nullInner: JSX.HTMLAttributes = { innerHTML: null as string | null | undefined };
void nullInner;

// Negative: number is not assignable to innerHTML
const invalidNumber: JSX.HTMLAttributes = {
  // @ts-expect-error innerHTML must be string | TrustedHTML
  innerHTML: 42,
};
void invalidNumber;

// Negative: object is not assignable to innerHTML
const invalidObject: JSX.HTMLAttributes = {
  // @ts-expect-error innerHTML must be string | TrustedHTML
  innerHTML: { __html: '<b>x</b>' },
};
void invalidObject;

// Negative: VoidHTMLAttributes does NOT have innerHTML
const voidAttrs: JSX.VoidHTMLAttributes = {
  // @ts-expect-error <img>/<br>/<input> are void elements — cannot have innerHTML
  innerHTML: '<b>x</b>',
};
void voidAttrs;

// Negative: VoidHTMLAttributes does NOT have children
const voidNoChildren: JSX.VoidHTMLAttributes = {
  // @ts-expect-error void elements cannot have children
  children: 'no',
};
void voidNoChildren;

// Positive: VoidHTMLAttributes still accepts className and style
const voidStyled: JSX.VoidHTMLAttributes = { className: 'x', style: 'color: red' };
void voidStyled;

// Positive: InputHTMLAttributes still has debounce (void + debounce)
const inputAttrs: JSX.InputHTMLAttributes = { debounce: 200, className: 'x' };
void inputAttrs;

// Negative: InputHTMLAttributes does NOT have innerHTML (via VoidHTMLAttributes)
const inputNoInner: JSX.InputHTMLAttributes = {
  // @ts-expect-error <input> is a void element — cannot have innerHTML
  innerHTML: '<b>x</b>',
};
void inputNoInner;

// IntrinsicElements regression coverage: void-element entries use
// VoidHTMLAttributes, so indexing by tag name rejects innerHTML at the type
// level (mirrors a real `<img innerHTML="..." />` call site).
type ImgProps = JSX.IntrinsicElements['img'];
const imgProps: ImgProps = {
  // @ts-expect-error <img> intrinsic type cannot have innerHTML
  innerHTML: '<b>x</b>',
};
void imgProps;

type BrProps = JSX.IntrinsicElements['br'];
const brProps: BrProps = {
  // @ts-expect-error <br> intrinsic type cannot have innerHTML
  innerHTML: '<b>x</b>',
};
void brProps;
