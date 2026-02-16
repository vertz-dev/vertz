/**
 * Type-level tests for FormInstance and form().
 *
 * These tests verify that schema types thread correctly through
 * the form API — from SdkMethod to FormInstance to error(field).
 * Checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */
import { form } from '../form';

// SdkMethod is callable
const _callResult = createUser({ name: 'Alice', email: 'a@b.com' });
void _callResult;
// SdkMethod exposes url and method
const _url = createUser.url;
const _method = createUser.method;
void _url;
void _method;
// @ts-expect-error - missing required property 'email'
createUser({ name: 'Alice' });
// @ts-expect-error - wrong type for 'name' property
createUser({ name: 123, email: 'a@b.com' });
const attrs = userForm.attrs();
const _action = attrs.action;
const _attrMethod = attrs.method;
void _action;
void _attrMethod;
// ─── FormInstance — submitting signal ─────────────────────────────
const _submitting = userForm.submitting;
void _submitting;
const _submittingValue = userForm.submitting.value;
void _submittingValue;
// ─── FormInstance — error() is type-safe on field names ───────────
// Valid field names from TBody
const _nameError = userForm.error('name');
const _emailError = userForm.error('email');
void _nameError;
void _emailError;
// @ts-expect-error - 'age' is not a key of UserBody
userForm.error('age');
// @ts-expect-error - 'id' is not a key of UserBody (it's on UserResult, not UserBody)
userForm.error('id');
// ─── FormInstance — handleSubmit() callbacks ──────────────────────
// handleSubmit returns an event handler
const handler = userForm.handleSubmit();
const _handlerType = handler;
void _handlerType;
// onSuccess callback receives the result type
userForm.handleSubmit({
  onSuccess: (result) => {
    const _id = result.id;
    void _id;
    // @ts-expect-error - 'name' does not exist on result type { id: number }
    const _bad = result.name;
    void _bad;
  },
});
// onError callback receives Record<string, string>
userForm.handleSubmit({
  onError: (errors) => {
    const _err = errors;
    void _err;
  },
});
// Both callbacks are optional
userForm.handleSubmit({});
userForm.handleSubmit();
// ─── SubmitCallbacks<TResult> — type constraint ──────────────────
// onSuccess result type must match
const _validCallbacks = {
  onSuccess: (result) => {
    const _id = result.id;
    void _id;
  },
};
void _validCallbacks;
// ─── form() — schema type threading ──────────────────────────────
// Create a mock SDK method
const mockSdk = Object.assign(async (_body) => ({ id: 1 }), { url: '/api/users', method: 'POST' });
// Create a mock schema
const mockSchema = {
  parse(data) {
    return data;
  },
};
// form() produces a FormInstance with correct type params
const createdForm = form(mockSdk, { schema: mockSchema });
const _formAttrs = createdForm.attrs();
const _formAction = _formAttrs.action;
void _formAction;
// error() on created form is type-safe
const _createdError = createdForm.error('name');
void _createdError;
// @ts-expect-error - 'invalid' is not a field of UserBody
createdForm.error('invalid');
// ─── FormOptions<TBody> — schema type must match ─────────────────
// Schema must match the TBody type
const _validOptions = {
  schema: mockSchema,
};
void _validOptions;
// Schema with incompatible return type should error
const wrongSchema = {
  parse: (_data) => ({ x: 1 }),
};
// @ts-expect-error - FormSchema<{ x: number }> is not assignable to FormSchema<UserBody>
const _badOptions = { schema: wrongSchema };
void _badOptions;
// All fields are valid
const _productErr = orderForm.error('productId');
const _quantityErr = orderForm.error('quantity');
const _notesErr = orderForm.error('notes');
void _productErr;
void _quantityErr;
void _notesErr;
// handleSubmit onSuccess gets the correct result type
orderForm.handleSubmit({
  onSuccess: (result) => {
    const _orderId = result.orderId;
    const _total = result.total;
    void _orderId;
    void _total;
  },
});
//# sourceMappingURL=form.test-d.js.map
