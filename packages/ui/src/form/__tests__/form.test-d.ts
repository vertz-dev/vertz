/**
 * Type-level tests for the redesigned FormInstance and form() API.
 *
 * These tests verify that types thread correctly through
 * the form API — from SdkMethod to FormInstance to per-field FieldState.
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { Result } from '@vertz/fetch';
import type { ReadonlySignal, Signal } from '../../runtime/signal-types';
import type { FormInstance, FormOptions, SdkMethod, SdkMethodWithMeta } from '../form';
import { form } from '../form';
import type { FormSchema } from '../validation';

// ─── Test body/result types ────────────────────────────────────────

type UserBody = { name: string; email: string };
type UserResult = { id: number };

declare const userForm: FormInstance<UserBody, UserResult>;

// ─── 1. FormOptions accepts all five option fields ─────────────────

const _opts: FormOptions<UserBody, UserResult> = {
  schema: { parse: (data: unknown) => ({ ok: true as const, data: data as UserBody }) },
  initial: { name: 'Alice' },
  onSuccess: (result) => {
    const _id: number = result.id;
    void _id;
  },
  onError: (errors) => {
    const _err: Record<string, string> = errors;
    void _err;
  },
  resetOnSuccess: true,
};
void _opts;

// ─── 2. FormInstance.action is string, .method is string ───────────

const _action: string = userForm.action;
const _method: string = userForm.method;
void _action;
void _method;

// ─── 3. FormInstance.onSubmit is (e: Event) => Promise<void> ───────

const _onSubmit: (e: Event) => Promise<void> = userForm.onSubmit;
void _onSubmit;

// ─── 4. FormInstance.submitting is Signal<boolean> ─────────────────

const _submitting: Signal<boolean> = userForm.submitting;
void _submitting;

const _submittingValue: boolean = userForm.submitting.value;
void _submittingValue;

// ─── 5. FormInstance.dirty is ReadonlySignal<boolean>, .valid is ReadonlySignal<boolean>

const _dirty: ReadonlySignal<boolean> = userForm.dirty;
const _valid: ReadonlySignal<boolean> = userForm.valid;
void _dirty;
void _valid;

// ─── 6. .reset() is () => void ────────────────────────────────────

const _reset: () => void = userForm.reset;
void _reset;

// ─── 7. .setFieldError(field, msg) only accepts keyof TBody ───────

userForm.setFieldError('name', 'Required');
userForm.setFieldError('email', 'Invalid');

// @ts-expect-error - 'age' is not a key of UserBody
userForm.setFieldError('age', 'Unknown field');

// ─── 8. .submit(formData?) is (formData?: FormData) => Promise<void>

const _submit: (formData?: FormData) => Promise<void> = userForm.submit;
void _submit;

// ─── 9. form.<field>.error is Signal<string | undefined> ──────────

const _emailError: Signal<string | undefined> = userForm.email.error;
void _emailError;

const _nameError: Signal<string | undefined> = userForm.name.error;
void _nameError;

// ─── 10. form.<field>.dirty, .touched, .value ──────────────────────

const _emailDirty: Signal<boolean> = userForm.email.dirty;
const _emailTouched: Signal<boolean> = userForm.email.touched;
const _emailValue: Signal<string> = userForm.email.value;
void _emailDirty;
void _emailTouched;
void _emailValue;

const _nameValue: Signal<string> = userForm.name.value;
void _nameValue;

// ─── 10b. form.<field>.setValue() and .reset() ───────────────────

const _setEmailValue: (value: string) => void = userForm.email.setValue;
void _setEmailValue;

const _resetEmail: () => void = userForm.email.reset;
void _resetEmail;

// ─── 11. Reserved name conflict → type error ──────────────────────

// When a field name conflicts with a reserved property, the type resolves
// to an error object with __error instead of FormBaseProperties.
// Accessing .action (a base property) should fail on the error branch.
type ConflictForm = FormInstance<{ submit: string }, void>;

// @ts-expect-error - 'submit' conflicts: type has __error, not action
const _conflictAction: string = ({} as ConflictForm).action;
void _conflictAction;

type ConflictForm2 = FormInstance<{ action: string }, void>;

// @ts-expect-error - 'action' conflicts: type has __error, not reset
const _conflictReset: () => void = ({} as ConflictForm2).reset;
void _conflictReset;

// ─── 13. SdkMethodWithMeta makes schema optional ──────────────────

const metaSchema: FormSchema<UserBody> = {
  parse(data: unknown) {
    return { ok: true as const, data: data as UserBody };
  },
};

const sdkWithMeta: SdkMethodWithMeta<UserBody, UserResult> = Object.assign(
  async (_body: UserBody): Promise<Result<UserResult, Error>> => ({
    ok: true as const,
    data: { id: 1 },
  }),
  { url: '/api/users', method: 'POST', meta: { bodySchema: metaSchema } },
);

// form() with SdkMethodWithMeta — options are OPTIONAL
const metaForm1 = form(sdkWithMeta);
void metaForm1;

// form() with SdkMethodWithMeta — explicit schema override is allowed
const metaForm2 = form(sdkWithMeta, { schema: metaSchema });
void metaForm2;

// form() with plain SdkMethod (no meta) — schema REQUIRED
const mockSdk: SdkMethod<UserBody, UserResult> = Object.assign(
  async (_body: UserBody): Promise<Result<UserResult, Error>> => ({
    ok: true as const,
    data: { id: 1 },
  }),
  { url: '/api/users', method: 'POST' },
);

// @ts-expect-error - SDK without .meta requires explicit schema
form(mockSdk);

// form() with plain SdkMethod + schema — works
const plainWithSchema = form(mockSdk, { schema: metaSchema });
void plainWithSchema;

// ─── 13b. fields — typed field names for compile-time input validation ──

// fields.name should be typed as the string literal 'name'
const _fieldName: 'name' = userForm.fields.name;
void _fieldName;

// fields.email should be typed as the string literal 'email'
const _fieldEmail: 'email' = userForm.fields.email;
void _fieldEmail;

// Accessing a non-existent field should be a type error
// @ts-expect-error - 'nonExistent' is not a key of UserBody
userForm.fields.nonExistent;

// Assigning to wrong literal should be a type error
// @ts-expect-error - fields.name is 'name', not 'email'
const _wrongLiteral: 'email' = userForm.fields.name;
void _wrongLiteral;

// ─── 14. No attrs() method ────────────────────────────────────────

// @ts-expect-error - attrs() no longer exists on FormInstance
userForm.attrs;

// ─── 15. No error() method ────────────────────────────────────────

// @ts-expect-error - error() no longer exists on FormInstance
userForm.error;

// ─── 16. No handleSubmit() method ─────────────────────────────────

// @ts-expect-error - handleSubmit() no longer exists on FormInstance
userForm.handleSubmit;

// ─── 19. Nested field access types ───────────────────────────────────

type NestedBody = { name: string; address: { street: string; city: string } };
declare const nestedForm: FormInstance<NestedBody, void>;

// Flat field on nested form still works
const _nestedNameError: Signal<string | undefined> = nestedForm.name.error;
void _nestedNameError;

// Nested field access: address.street.error
const _streetError: Signal<string | undefined> = nestedForm.address.street.error;
void _streetError;

const _cityValue: Signal<string> = nestedForm.address.city.value;
void _cityValue;

// Group-level field state
const _addressError: Signal<string | undefined> = nestedForm.address.error;
void _addressError;

// @ts-expect-error - 'nonexistent' is not a key of address
nestedForm.address.nonexistent;

// ─── 20. DeepPartial initial values ─────────────────────────────────

const _nestedOpts: FormOptions<NestedBody, void> = {
  initial: { address: { city: 'Springfield' } }, // partial nested — no name, no street
};
void _nestedOpts;

// ─── 21. FieldPath — setFieldError accepts dot-path strings ─────────

nestedForm.setFieldError('name', 'Required');
nestedForm.setFieldError('address', 'Invalid address');
nestedForm.setFieldError('address.street', 'Street required');
nestedForm.setFieldError('address.city', 'City required');

// @ts-expect-error - 'address.nonexistent' is not a valid FieldPath
nestedForm.setFieldError('address.nonexistent', 'Bad');

// @ts-expect-error - 'foo' is not a valid FieldPath
nestedForm.setFieldError('foo', 'Bad');

// ─── 22. Array field access types ────────────────────────────────────

type OrderBody = { items: Array<{ product: string; quantity: number }> };
declare const orderForm: FormInstance<OrderBody, void>;

const _orderItem = orderForm.items[0];
// biome-ignore lint/style/noNonNullAssertion: type test needs definite access
const _itemProductError: Signal<string | undefined> = _orderItem!.product.error;
void _itemProductError;

// biome-ignore lint/style/noNonNullAssertion: type test needs definite access
const _itemQuantityValue: Signal<number> = _orderItem!.quantity.value;
void _itemQuantityValue;

// ─── 23. BuiltInObjects are leaf FieldState (no recursion) ───────────

type WithDate = { name: string; createdAt: Date };
declare const dateForm: FormInstance<WithDate, void>;

const _dateValue: Signal<Date> = dateForm.createdAt.value;
void _dateValue;

// Date is a leaf — should NOT recurse into Date prototype methods
const _dateError: Signal<string | undefined> = dateForm.createdAt.error;
void _dateError;

// ─── 24. Reserved field name collision in nested object ──────────────

type BadNested = { meta: { error: string; name: string } };
type BadForm = FormInstance<BadNested, void>;

// 'error' in meta conflicts with FieldState.error — type should produce __error
// @ts-expect-error - meta has __error, accessing .error should fail
const _badError: Signal<string | undefined> = ({} as BadForm).meta.error;
void _badError;

// ─── SdkMethod basics (unchanged) ─────────────────────────────────

declare const createUser: SdkMethod<UserBody, UserResult>;

const _callResult: PromiseLike<Result<UserResult, Error>> = createUser({
  name: 'Alice',
  email: 'a@b.com',
});
void _callResult;

const _url: string = createUser.url;
const _methodStr: string = createUser.method;
void _url;
void _methodStr;

// @ts-expect-error - missing required property 'email'
createUser({ name: 'Alice' });

// @ts-expect-error - wrong type for 'name' property
createUser({ name: 123, email: 'a@b.com' });

// ─── 18. SdkMethod accepts PromiseLike return (QueryDescriptor compat) ──

// A function returning PromiseLike (like QueryDescriptor) with .url/.method
// should satisfy SdkMethod — generated SDK methods return QueryDescriptor.
const sdkReturningPromiseLike: SdkMethod<UserBody, UserResult> = Object.assign(
  (_body: UserBody): PromiseLike<Result<UserResult, Error>> =>
    Promise.resolve({ ok: true as const, data: { id: 1 } }),
  { url: '/api/users', method: 'POST' },
);
void sdkReturningPromiseLike;
