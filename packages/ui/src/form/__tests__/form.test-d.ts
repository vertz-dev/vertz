/**
 * Type-level tests for FormInstance and form().
 *
 * These tests verify that schema types thread correctly through
 * the form API — from SdkMethod to FormInstance to error(field).
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { Signal } from '../../runtime/signal-types';
import type { FormInstance, FormOptions, SdkMethod, SubmitCallbacks } from '../form';
import { form } from '../form';
import type { FormSchema } from '../validation';

// ─── SdkMethod<TBody, TResult> — callable with metadata ──────────

declare const createUser: SdkMethod<{ name: string; email: string }, { id: number }>;

// SdkMethod is callable
const _callResult: Promise<{ id: number }> = createUser({ name: 'Alice', email: 'a@b.com' });
void _callResult;

// SdkMethod exposes url and method
const _url: string = createUser.url;
const _method: string = createUser.method;
void _url;
void _method;

// @ts-expect-error - missing required property 'email'
createUser({ name: 'Alice' });

// @ts-expect-error - wrong type for 'name' property
createUser({ name: 123, email: 'a@b.com' });

// ─── FormInstance — attrs() returns action, method, and onSubmit ──

type UserBody = { name: string; email: string };
type UserResult = { id: number };

declare const userForm: FormInstance<UserBody, UserResult>;

const attrs = userForm.attrs();
const _action: string = attrs.action;
const _attrMethod: string = attrs.method;
const _onSubmit: (e: Event) => Promise<void> = attrs.onSubmit;
void _action;
void _attrMethod;
void _onSubmit;

// attrs() accepts optional callbacks
const attrsWithCallbacks = userForm.attrs({
  onSuccess: (result) => {
    const _id: number = result.id;
    void _id;
  },
  onError: (errors) => {
    const _err: Record<string, string> = errors;
    void _err;
  },
  resetOnSuccess: true,
});
void attrsWithCallbacks;

// attrs() works without callbacks
const attrsNoCallbacks = userForm.attrs();
void attrsNoCallbacks;

// ─── FormInstance — submitting signal ─────────────────────────────

const _submitting: Signal<boolean> = userForm.submitting;
void _submitting;

const _submittingValue: boolean = userForm.submitting.value;
void _submittingValue;

// ─── FormInstance — error() is type-safe on field names ───────────

// Valid field names from TBody
const _nameError: string | undefined = userForm.error('name');
const _emailError: string | undefined = userForm.error('email');
void _nameError;
void _emailError;

// @ts-expect-error - 'age' is not a key of UserBody
userForm.error('age');

// @ts-expect-error - 'id' is not a key of UserBody (it's on UserResult, not UserBody)
userForm.error('id');

// ─── FormInstance — handleSubmit() callbacks ──────────────────────

// handleSubmit returns an event handler
const handler = userForm.handleSubmit();
const _handlerType: (formDataOrEvent: FormData | Event) => Promise<void> = handler;
void _handlerType;

// onSuccess callback receives the result type
userForm.handleSubmit({
  onSuccess: (result) => {
    const _id: number = result.id;
    void _id;

    // @ts-expect-error - 'name' does not exist on result type { id: number }
    const _bad: string = result.name;
    void _bad;
  },
});

// onError callback receives Record<string, string>
userForm.handleSubmit({
  onError: (errors) => {
    const _err: Record<string, string> = errors;
    void _err;
  },
});

// Both callbacks are optional
userForm.handleSubmit({});
userForm.handleSubmit();

// ─── SubmitCallbacks<TResult> — type constraint ──────────────────

// onSuccess result type must match
const _validCallbacks: SubmitCallbacks<{ id: number }> = {
  onSuccess: (result) => {
    const _id: number = result.id;
    void _id;
  },
};
void _validCallbacks;

// ─── form() — schema type threading ──────────────────────────────

// Create a mock SDK method
const mockSdk: SdkMethod<UserBody, UserResult> = Object.assign(
  async (_body: UserBody): Promise<UserResult> => ({ id: 1 }),
  { url: '/api/users', method: 'POST' },
);

// Create a mock schema
const mockSchema: FormSchema<UserBody> = {
  parse(data: unknown): UserBody {
    return data as UserBody;
  },
};

// form() produces a FormInstance with correct type params
const createdForm = form(mockSdk, { schema: mockSchema });
const _formAttrs = createdForm.attrs();
const _formAction: string = _formAttrs.action;
void _formAction;

// error() on created form is type-safe
const _createdError: string | undefined = createdForm.error('name');
void _createdError;

// @ts-expect-error - 'invalid' is not a field of UserBody
createdForm.error('invalid');

// ─── FormOptions<TBody> — schema type must match ─────────────────

// Schema must match the TBody type
const _validOptions: FormOptions<UserBody> = {
  schema: mockSchema,
};
void _validOptions;

// Schema with incompatible return type should error
const wrongSchema: FormSchema<{ x: number }> = {
  parse: (_data: unknown): { x: number } => ({ x: 1 }),
};
// @ts-expect-error - FormSchema<{ x: number }> is not assignable to FormSchema<UserBody>
const _badOptions: FormOptions<UserBody> = { schema: wrongSchema };
void _badOptions;

// ─── FormInstance — complex body type ─────────────────────────────

interface OrderBody {
  productId: string;
  quantity: number;
  notes: string;
}

interface OrderResult {
  orderId: string;
  total: number;
}

declare const orderForm: FormInstance<OrderBody, OrderResult>;

// All fields are valid
const _productErr: string | undefined = orderForm.error('productId');
const _quantityErr: string | undefined = orderForm.error('quantity');
const _notesErr: string | undefined = orderForm.error('notes');
void _productErr;
void _quantityErr;
void _notesErr;

// handleSubmit onSuccess gets the correct result type
orderForm.handleSubmit({
  onSuccess: (result) => {
    const _orderId: string = result.orderId;
    const _total: number = result.total;
    void _orderId;
    void _total;
  },
});
