import { describe, expect, test, vi } from 'vitest';
import { form } from '../form/form';
import { formDataToObject } from '../form/form-data';
import type { FormSchema } from '../form/validation';

/** Helper: creates a mock SDK method with url/method metadata. */
function mockSdkMethod<TBody, TResult>(config: {
  url: string;
  method: string;
  handler: (body: TBody) => Promise<TResult>;
}) {
  const fn = config.handler as ((body: TBody) => Promise<TResult>) & {
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
    const handler = vi.fn().mockResolvedValue({ id: 1, name: 'Alice', role: 'admin' });
    const sdk = mockSdkMethod({
      url: '/api/users',
      method: 'POST',
      handler,
    });
    const schema: FormSchema<{ name: string; role: string }> = {
      parse(data: unknown) {
        return data as { name: string; role: string };
      },
    };

    const onSuccess = vi.fn();
    const onError = vi.fn();

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
    const handler = vi.fn().mockResolvedValue({});
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
          throw err;
        }
        return obj;
      },
    };

    const onSuccess = vi.fn();
    const onError = vi.fn();

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
