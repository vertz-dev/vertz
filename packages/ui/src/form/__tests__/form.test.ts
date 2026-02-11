import { describe, expect, it, vi } from 'vitest';
import { form } from '../form';
import type { FormSchema } from '../validation';

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

/** Helper: creates a simple passing schema. */
function passingSchema<T>(): FormSchema<T> {
  return {
    parse(data: unknown) {
      return data as T;
    },
  };
}

/** Helper: creates a schema that always fails with field errors. */
function failingSchema<T>(fieldErrors: Record<string, string>): FormSchema<T> {
  return {
    parse(_data: unknown) {
      const err = new Error('Validation failed');
      (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = fieldErrors;
      throw err;
    },
  };
}

describe('form', () => {
  describe('attrs()', () => {
    it('returns action and method from SDK method metadata', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });

      expect(f.attrs()).toEqual({ action: '/api/users', method: 'POST' });
    });

    it('preserves the method casing from SDK metadata', () => {
      const sdk = mockSdkMethod({
        url: '/api/items',
        method: 'PUT',
        handler: async () => ({}),
      });

      const f = form(sdk, { schema: passingSchema() });

      expect(f.attrs()).toEqual({ action: '/api/items', method: 'PUT' });
    });
  });

  describe('submitting', () => {
    it('starts as false', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });

      expect(f.submitting.peek()).toBe(false);
    });

    it('is true during submission and false after', async () => {
      let resolveHandler!: (value: { id: number }) => void;
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: () =>
          new Promise<{ id: number }>((resolve) => {
            resolveHandler = resolve;
          }),
      });

      const f = form(sdk, { schema: passingSchema() });

      const fd = new FormData();
      fd.append('name', 'Alice');

      const handler = f.handleSubmit({
        onSuccess: () => {},
        onError: () => {},
      });
      const submitPromise = handler(fd);

      expect(f.submitting.peek()).toBe(true);

      resolveHandler({ id: 1 });
      await submitPromise;

      expect(f.submitting.peek()).toBe(false);
    });
  });

  describe('handleSubmit', () => {
    it('returns an event handler function', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });
      const handler = f.handleSubmit({ onSuccess: () => {} });

      expect(typeof handler).toBe('function');
    });

    it('works with empty callbacks', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });

      const f = form(sdk, { schema: passingSchema() });

      const fd = new FormData();
      fd.append('name', 'Alice');

      // Empty callbacks — should not throw
      await f.handleSubmit({})(fd);
      expect(handler).toHaveBeenCalled();
    });

    it('works with no callbacks argument', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });

      const f = form(sdk, { schema: passingSchema() });

      const fd = new FormData();
      fd.append('name', 'Alice');

      // No callbacks at all
      await f.handleSubmit()(fd);
      expect(handler).toHaveBeenCalled();
    });

    it('extracts FormData, validates, and calls SDK method on success', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1, name: 'Alice' });
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });
      const schema = passingSchema<{ name: string }>();

      const f = form(sdk, { schema });

      const fd = new FormData();
      fd.append('name', 'Alice');

      const onSuccess = vi.fn();
      const onError = vi.fn();

      await f.handleSubmit({ onSuccess, onError })(fd);

      expect(handler).toHaveBeenCalledWith({ name: 'Alice' });
      expect(onSuccess).toHaveBeenCalledWith({ id: 1, name: 'Alice' });
      expect(onError).not.toHaveBeenCalled();
    });

    it('calls onError with validation errors when schema fails', async () => {
      const handler = vi.fn().mockResolvedValue({});
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });
      const schema = failingSchema<{ name: string }>({ name: 'Name is required' });

      const f = form(sdk, { schema });

      const fd = new FormData();
      fd.append('name', '');

      const onSuccess = vi.fn();
      const onError = vi.fn();

      await f.handleSubmit({ onSuccess, onError })(fd);

      expect(handler).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith({ name: 'Name is required' });
    });

    it('calls onError when SDK method rejects', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Server error'));
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });

      const f = form(sdk, { schema: passingSchema() });

      const fd = new FormData();
      fd.append('name', 'Alice');

      const onSuccess = vi.fn();
      const onError = vi.fn();

      await f.handleSubmit({ onSuccess, onError })(fd);

      expect(onSuccess).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith({ _form: 'Server error' });
    });

    it('does not misattribute onSuccess exceptions as server errors', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });

      const f = form(sdk, { schema: passingSchema() });

      const fd = new FormData();
      fd.append('name', 'Alice');

      const onError = vi.fn();

      // onSuccess throws — should NOT be caught and routed to onError
      await expect(
        f.handleSubmit({
          onSuccess: () => {
            throw new Error('callback bug');
          },
          onError,
        })(fd),
      ).rejects.toThrow('callback bug');

      // onError should NOT have been called with the callback error
      expect(onError).not.toHaveBeenCalled();
    });

    it('resets submitting to false even when SDK method rejects', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('fail'));
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });

      const f = form(sdk, { schema: passingSchema() });

      const fd = new FormData();
      fd.append('name', 'Alice');

      await f.handleSubmit({ onSuccess: () => {}, onError: () => {} })(fd);

      expect(f.submitting.peek()).toBe(false);
    });
  });

  describe('error()', () => {
    it('returns undefined when no errors exist', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({}),
      });

      const f = form(sdk, { schema: passingSchema() });

      expect(f.error('name')).toBeUndefined();
    });

    it('returns field-level error after validation failure', async () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({}),
      });
      const schema = failingSchema<{ name: string; email: string }>({
        name: 'Name is required',
        email: 'Email is invalid',
      });

      const f = form(sdk, { schema });

      const fd = new FormData();
      fd.append('name', '');
      fd.append('email', 'bad');

      await f.handleSubmit({ onSuccess: () => {}, onError: () => {} })(fd);

      expect(f.error('name')).toBe('Name is required');
      expect(f.error('email')).toBe('Email is invalid');
    });

    it('clears errors on same instance after successful resubmission', async () => {
      let shouldFail = true;
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const schema: FormSchema<{ name: string }> = {
        parse(data: unknown) {
          if (shouldFail) {
            const err = new Error('Validation failed');
            (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = {
              name: 'Required',
            };
            throw err;
          }
          return data as { name: string };
        },
      };

      const f = form(sdk, { schema });

      // First submission — validation fails
      const fd1 = new FormData();
      fd1.append('name', '');
      await f.handleSubmit({ onError: () => {} })(fd1);
      expect(f.error('name')).toBe('Required');

      // Second submission — validation passes (same form instance)
      shouldFail = false;
      const fd2 = new FormData();
      fd2.append('name', 'Alice');
      await f.handleSubmit({ onSuccess: () => {} })(fd2);
      expect(f.error('name')).toBeUndefined();
    });
  });
});
