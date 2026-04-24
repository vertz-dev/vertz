import { describe, expect, test, mock } from '@vertz/test';
import { err, FetchValidationError, ok } from '@vertz/fetch';
import { s } from '@vertz/schema';
import { form } from '../form/form';
import { formDataToObject } from '../form/form-data';
import type { FormSchema } from '../form/validation';

/** Helper: creates a mock HTMLFormElement with event dispatch support. */
function createMockFormElement() {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  const el = {
    addEventListener: mock((type: string, handler: (e: Event) => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    }),
    removeEventListener: mock(),
    reset: mock(),
    dispatchEvent(e: Event) {
      const handlers = listeners[e.type] || [];
      for (const h of handlers) h(e);
    },
  } as unknown as HTMLFormElement;
  return el;
}

function createInputEvent(name: string, value: string, type = 'input') {
  const event = new Event(type, { bubbles: true });
  Object.defineProperty(event, 'target', { value: { name, value } });
  return event;
}

function createFocusoutEvent(name: string) {
  const event = new Event('focusout', { bubbles: true });
  Object.defineProperty(event, 'target', { value: { name } });
  return event;
}

/** Helper: creates a mock SDK method with url/method metadata. */
function mockSdkMethod<TBody, TResult>(config: {
  url: string;
  method: string;
  handler: (body: TBody) => Promise<TResult>;
}) {
  const wrappedHandler = async (body: TBody) => ok(await config.handler(body));
  const fn = wrappedHandler as ((body: TBody) => Promise<{ ok: true; data: TResult }>) & {
    url: string;
    method: string;
  };
  fn.url = config.url;
  fn.method = config.method;
  return fn;
}

/** Helper: creates a mock SDK method that always returns an error result. */
function mockFailingSdkMethod<TBody>(config: { url: string; method: string; error: Error }) {
  const wrappedHandler = async (_body: TBody) => err(config.error);
  const fn = wrappedHandler as ((body: TBody) => Promise<ReturnType<typeof err>>) & {
    url: string;
    method: string;
  };
  fn.url = config.url;
  fn.method = config.method;
  return fn;
}

/** Helper: creates a mock SDK method whose errors are driven by a sequence. */
function mockSequencedFailingSdk<TBody>(config: {
  url: string;
  method: string;
  errors: readonly Error[];
}) {
  let i = 0;
  const wrappedHandler = async (_body: TBody) => {
    const e = config.errors[Math.min(i++, config.errors.length - 1)] ?? new Error('unexpected');
    return err(e);
  };
  const fn = wrappedHandler as ((body: TBody) => Promise<ReturnType<typeof err>>) & {
    url: string;
    method: string;
  };
  fn.url = config.url;
  fn.method = config.method;
  return fn;
}

describe('Integration Tests — Forms', () => {
  // IT-3-1: form() submits valid data through SDK method
  test('form() submits valid data through SDK method', async () => {
    const handler = mock().mockResolvedValue({ id: 1, name: 'Alice', role: 'admin' });
    const sdk = mockSdkMethod({
      url: '/api/users',
      method: 'POST',
      handler,
    });
    const schema: FormSchema<{ name: string; role: string }> = {
      parse(data: unknown) {
        return { ok: true as const, data: data as { name: string; role: string } };
      },
    };

    const onSuccess = mock();
    const onError = mock();

    const userForm = form(sdk, { schema, onSuccess, onError });

    const fd = new FormData();
    fd.append('name', 'Alice');
    fd.append('role', 'admin');

    await userForm.submit(fd);

    // SDK method was called with the extracted data
    expect(handler).toHaveBeenCalledWith({ name: 'Alice', role: 'admin' });
    // onSuccess received the SDK response
    expect(onSuccess).toHaveBeenCalledWith({ id: 1, name: 'Alice', role: 'admin' });
    // No errors occurred
    expect(onError).not.toHaveBeenCalled();
    // Submitting is false after completion
    expect(userForm.submitting.peek()).toBe(false);
  });

  // IT-3-2: form() validates client-side before submission (shows errors)
  test('form() validates client-side before submission and shows errors', async () => {
    const handler = mock().mockResolvedValue({});
    const sdk = mockSdkMethod({
      url: '/api/users',
      method: 'POST',
      handler,
    });
    const schema: FormSchema<{ name: string; email: string }> = {
      parse(data: unknown) {
        const obj = data as { name: string; email: string };
        const errors: Record<string, string> = {};
        if (!obj.name || obj.name.length === 0) {
          errors.name = 'Name is required';
        }
        if (!obj.email || !obj.email.includes('@')) {
          errors.email = 'Valid email is required';
        }
        if (Object.keys(errors).length > 0) {
          const err = new Error('Validation failed');
          (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
          return { ok: false as const, error: err };
        }
        return { ok: true as const, data: obj };
      },
    };

    const onSuccess = mock();
    const onError = mock();

    const userForm = form(sdk, { schema, onSuccess, onError });

    const fd = new FormData();
    fd.append('name', '');
    fd.append('email', 'invalid');

    await userForm.submit(fd);

    // SDK method was NOT called — validation prevented it
    expect(handler).not.toHaveBeenCalled();
    // Field-level errors are accessible via per-field signals
    expect(userForm.name.error.peek()).toBe('Name is required');
    expect(userForm.email.error.peek()).toBe('Valid email is required');
    // onError was called with the errors
    expect(onError).toHaveBeenCalledWith({
      name: 'Name is required',
      email: 'Valid email is required',
    });
  });

  // IT-3-2b: form() maps server 422 validation errors to field error signals
  test('form() maps server 422 validation errors to per-field error signals', async () => {
    const validationError = new FetchValidationError('Validation failed', [
      { path: 'title', message: 'Title is required' },
      { path: 'status', message: "Invalid enum value. Expected 'todo' | 'done', received ''" },
    ]);
    const sdk = mockFailingSdkMethod<{ title: string; status: string }>({
      url: '/api/tasks',
      method: 'POST',
      error: validationError,
    });

    const schema: FormSchema<{ title: string; status: string }> = {
      parse(data: unknown) {
        return { ok: true as const, data: data as { title: string; status: string } };
      },
    };

    const onSuccess = mock();
    const onError = mock();

    const taskForm = form(sdk, { schema, onSuccess, onError });

    const fd = new FormData();
    fd.append('title', '');
    fd.append('status', '');

    await taskForm.submit(fd);

    // Per-field errors are mapped from the server response to field signals
    expect(taskForm.title.error.peek()).toBe('Title is required');
    expect(taskForm.status.error.peek()).toBe(
      "Invalid enum value. Expected 'todo' | 'done', received ''",
    );
    // onError is called with the mapped per-field record
    expect(onError).toHaveBeenCalledWith({
      title: 'Title is required',
      status: "Invalid enum value. Expected 'todo' | 'done', received ''",
    });
    // onSuccess was NOT called because submission failed
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // IT-3-2b-form: form() maps a `_form` path (top-level validation error) to the _form field
  test('form() maps `_form` path server error to the _form pseudo-field', async () => {
    const validationError = new FetchValidationError('Validation failed', [
      { path: '_form', message: 'Cross-field constraint violated' },
    ]);
    const sdk = mockFailingSdkMethod<{ start: string; end: string }>({
      url: '/api/events',
      method: 'POST',
      error: validationError,
    });

    const schema: FormSchema<{ start: string; end: string }> = {
      parse(data: unknown) {
        return { ok: true as const, data: data as { start: string; end: string } };
      },
    };

    const onError = mock();
    const eventForm = form(sdk, { schema, onError });

    const fd = new FormData();
    fd.append('start', '2026-01-02');
    fd.append('end', '2026-01-01');

    await eventForm.submit(fd);

    expect(onError).toHaveBeenCalledWith({ _form: 'Cross-field constraint violated' });
  });

  // IT-3-2b-reset: server field errors from a prior submission clear on the next submission
  test('form() clears stale server field errors on the next submission', async () => {
    const schema: FormSchema<{ name: string; email: string }> = {
      parse(data: unknown) {
        return { ok: true as const, data: data as { name: string; email: string } };
      },
    };

    const sdk = mockSequencedFailingSdk<{ name: string; email: string }>({
      url: '/api/users',
      method: 'POST',
      errors: [
        new FetchValidationError('Validation failed', [
          { path: 'name', message: 'Name taken' },
          { path: 'email', message: 'Email taken' },
        ]),
        new FetchValidationError('Validation failed', [
          { path: 'name', message: 'Name still taken' },
        ]),
      ],
    });

    const userForm = form(sdk, { schema });

    const fd1 = new FormData();
    fd1.append('name', 'Alice');
    fd1.append('email', 'alice@test.com');
    await userForm.submit(fd1);
    expect(userForm.name.error.peek()).toBe('Name taken');
    expect(userForm.email.error.peek()).toBe('Email taken');

    const fd2 = new FormData();
    fd2.append('name', 'Alice');
    fd2.append('email', 'alice2@test.com');
    await userForm.submit(fd2);
    // `name` re-fails with a new message; `email` is cleared on re-submission.
    expect(userForm.name.error.peek()).toBe('Name still taken');
    expect(userForm.email.error.peek()).toBeUndefined();
  });

  // IT-3-2c: form() falls back to _form error for non-validation failures
  test('form() falls back to _form error for non-validation SDK errors', async () => {
    const sdk = mockFailingSdkMethod<{ name: string }>({
      url: '/api/users',
      method: 'POST',
      error: new Error('Network is unreachable'),
    });

    const schema: FormSchema<{ name: string }> = {
      parse(data: unknown) {
        return { ok: true as const, data: data as { name: string } };
      },
    };

    const onError = mock();
    const userForm = form(sdk, { schema, onError });

    const fd = new FormData();
    fd.append('name', 'Alice');

    await userForm.submit(fd);

    // Generic errors still land on the `_form` pseudo-field,
    // and `name` is untouched
    expect(userForm.name.error.peek()).toBeUndefined();
    expect(onError).toHaveBeenCalledWith({ _form: 'Network is unreachable' });
  });

  // IT-3-3: formDataToObject converts FormData with proper handling
  test('formDataToObject converts FormData with proper type handling', () => {
    const fd = new FormData();
    fd.append('name', 'Bob');
    fd.append('age', '30');
    fd.append('active', 'true');
    fd.append('avatar', new File(['img'], 'avatar.png'));

    // Without coercion — all strings, files skipped
    const raw = formDataToObject(fd);
    expect(raw).toEqual({ name: 'Bob', age: '30', active: 'true' });
    expect(raw).not.toHaveProperty('avatar');

    // With coercion — numbers and booleans converted
    const coerced = formDataToObject(fd, { coerce: true });
    expect(coerced).toEqual({ name: 'Bob', age: 30, active: true });
    expect(coerced).not.toHaveProperty('avatar');
  });

  // IT-3-4: direct properties return correct action and method from SDK metadata
  test('direct properties return correct action and method from SDK metadata', () => {
    const postSdk = mockSdkMethod({
      url: '/api/users',
      method: 'POST',
      handler: async () => ({}),
    });
    const putSdk = mockSdkMethod({
      url: '/api/users/123',
      method: 'PUT',
      handler: async () => ({}),
    });
    const deleteSdk = mockSdkMethod({
      url: '/api/users/123',
      method: 'DELETE',
      handler: async () => ({}),
    });

    const schema: FormSchema<Record<string, string>> = {
      parse: (data: unknown) => data as Record<string, string>,
    };

    const postForm = form(postSdk, { schema });
    const putForm = form(putSdk, { schema });
    const deleteForm = form(deleteSdk, { schema });

    expect(postForm.action).toBe('/api/users');
    expect(postForm.method).toBe('POST');
    expect(typeof postForm.onSubmit).toBe('function');

    expect(putForm.action).toBe('/api/users/123');
    expect(putForm.method).toBe('PUT');
    expect(typeof putForm.onSubmit).toBe('function');

    expect(deleteForm.action).toBe('/api/users/123');
    expect(deleteForm.method).toBe('DELETE');
    expect(typeof deleteForm.onSubmit).toBe('function');
  });
});

describe('Integration Tests — Form Revalidation', () => {
  test('revalidateOn blur (default) with @vertz/schema clears error on valid blur', async () => {
    const schema = s.object({ title: s.string().min(1), priority: s.string() });
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/tasks', method: 'POST', handler });
    const f = form(sdk, { schema });
    const el = createMockFormElement();
    f.__bindElement(el);

    // Submit with invalid data
    const fd = new FormData();
    fd.append('title', '');
    fd.append('priority', 'low');
    await f.submit(fd);

    expect(f.title.error.peek()).toBeDefined();
    expect(f.priority.error.peek()).toBeUndefined();

    // Fix title, blur — error should clear via single-field validation
    el.dispatchEvent(createInputEvent('title', 'Valid'));
    el.dispatchEvent(createFocusoutEvent('title'));
    expect(f.title.error.peek()).toBeUndefined();
  });

  test('revalidateOn change with @vertz/schema clears error on input', async () => {
    const schema = s.object({ title: s.string().min(1) });
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/tasks', method: 'POST', handler });
    const f = form(sdk, { schema, revalidateOn: 'change' });
    const el = createMockFormElement();
    f.__bindElement(el);

    const fd = new FormData();
    fd.append('title', '');
    await f.submit(fd);
    expect(f.title.error.peek()).toBeDefined();

    // Type valid value — error clears without blur
    el.dispatchEvent(createInputEvent('title', 'Fixed'));
    expect(f.title.error.peek()).toBeUndefined();
  });

  test('revalidateOn submit with @vertz/schema does NOT clear on blur', async () => {
    const schema = s.object({ title: s.string().min(1) });
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/tasks', method: 'POST', handler });
    const f = form(sdk, { schema, revalidateOn: 'submit' });
    const el = createMockFormElement();
    f.__bindElement(el);

    const fd = new FormData();
    fd.append('title', '');
    await f.submit(fd);
    expect(f.title.error.peek()).toBeDefined();

    el.dispatchEvent(createInputEvent('title', 'Fixed'));
    el.dispatchEvent(createFocusoutEvent('title'));
    // Error persists — only submit clears it
    expect(f.title.error.peek()).toBeDefined();
  });

  test('generic FormSchema without .shape falls back to full validation on blur', async () => {
    const schema: FormSchema<{ title: string }> = {
      parse(data: unknown) {
        const obj = data as { title: string };
        if (!obj.title || obj.title.length === 0) {
          const err = new Error('Validation failed');
          (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = {
            title: 'Title is required',
          };
          return { ok: false, error: err };
        }
        return { ok: true, data: obj };
      },
    };
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/tasks', method: 'POST', handler });
    const f = form(sdk, { schema });
    const el = createMockFormElement();
    f.__bindElement(el);

    const fd = new FormData();
    fd.append('title', '');
    await f.submit(fd);
    expect(f.title.error.peek()).toBe('Title is required');

    // Fix and blur — fallback full validation clears the error
    el.dispatchEvent(createInputEvent('title', 'Fixed'));
    el.dispatchEvent(createFocusoutEvent('title'));
    expect(f.title.error.peek()).toBeUndefined();
  });

  test('generic schema with nested fields assembles nested object for fallback', async () => {
    const schema: FormSchema<{ address: { street: string } }> = {
      parse(data: unknown) {
        const obj = data as { address?: { street?: string } };
        if (!obj.address?.street || obj.address.street.length === 0) {
          const err = new Error('Validation failed');
          (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = {
            'address.street': 'Street is required',
          };
          return { ok: false, error: err };
        }
        return { ok: true, data: data as { address: { street: string } } };
      },
    };
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
    const f = form(sdk, { schema });
    const el = createMockFormElement();
    f.__bindElement(el);

    const fd = new FormData();
    fd.append('address.street', '');
    await f.submit(fd);
    expect(f.address.street.error.peek()).toBe('Street is required');

    // Fix and blur — fallback should assemble nested object correctly
    el.dispatchEvent(createInputEvent('address.street', '123 Main'));
    el.dispatchEvent(createFocusoutEvent('address.street'));
    expect(f.address.street.error.peek()).toBeUndefined();
  });

  test('nested optional field schema revalidates on blur', async () => {
    const schema = s.object({
      address: s.object({ street: s.string().min(1) }).optional(),
    });
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
    const f = form(sdk, { schema });
    const el = createMockFormElement();
    f.__bindElement(el);

    // Submit with empty nested field
    const fd = new FormData();
    fd.append('address.street', '');
    await f.submit(fd);
    expect(f.address.street.error.peek()).toBeDefined();

    // Fix and blur
    el.dispatchEvent(createInputEvent('address.street', '123 Main St'));
    el.dispatchEvent(createFocusoutEvent('address.street'));
    expect(f.address.street.error.peek()).toBeUndefined();
  });
});
