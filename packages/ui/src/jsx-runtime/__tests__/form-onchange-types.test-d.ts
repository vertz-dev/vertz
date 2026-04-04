// Type tests for form onChange and debounce props — compile-time assertions
// These verify that the JSX type system correctly types form-related attributes.

import type { FormValues } from '../../dom/form-on-change';
import type { JSX } from '../index';

// ── FormHTMLAttributes.onChange accepts FormValues handler ──────────────

void (0 as unknown as JSX.FormHTMLAttributes satisfies { onChange?: (values: FormValues) => void });

const _validFormProps: JSX.FormHTMLAttributes = {
  onChange: (values) => {
    void (values satisfies FormValues);
  },
};
void _validFormProps;

const _invalidFormProps: JSX.FormHTMLAttributes = {
  // @ts-expect-error — onChange on form takes FormValues, not Event
  onChange: (e: Event) => {
    e.preventDefault();
  },
};
void _invalidFormProps;

// ── InputHTMLAttributes.debounce accepts number ────────────────────────

const _validInputProps: JSX.InputHTMLAttributes = { debounce: 300 };
void _validInputProps;

// @ts-expect-error — debounce must be a number, not a string
const _invalidInputProps: JSX.InputHTMLAttributes = { debounce: 'fast' };
void _invalidInputProps;

// ── TextareaHTMLAttributes.debounce accepts number ─────────────────────

const _validTextareaProps: JSX.TextareaHTMLAttributes = { debounce: 500 };
void _validTextareaProps;

// ── SelectHTMLAttributes.debounce accepts number ───────────────────────

const _validSelectProps: JSX.SelectHTMLAttributes = { debounce: 200 };
void _validSelectProps;

// ── IntrinsicElements maps form/input/textarea/select to specific types ─

type FormAttrs = JSX.IntrinsicElements['form'];
void (0 as unknown as FormAttrs satisfies JSX.FormHTMLAttributes);

type InputAttrs = JSX.IntrinsicElements['input'];
void (0 as unknown as InputAttrs satisfies JSX.InputHTMLAttributes);

type TextareaAttrs = JSX.IntrinsicElements['textarea'];
void (0 as unknown as TextareaAttrs satisfies JSX.TextareaHTMLAttributes);

type SelectAttrs = JSX.IntrinsicElements['select'];
void (0 as unknown as SelectAttrs satisfies JSX.SelectHTMLAttributes);

// ── Catch-all still works for other elements ───────────────────────────

type DivAttrs = JSX.IntrinsicElements['div'];
void (0 as unknown as DivAttrs satisfies JSX.HTMLAttributes | undefined);
