import { s } from '@vertz/schema';
import { describe, expect, it, vi } from 'vitest';
import type { SdkMethodWithMeta } from '../form';
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

/**
 * Helper: creates a submit Event with a mock form element and
 * patches globalThis.FormData so `new FormData(target)` returns
 * the provided entries. Returns a cleanup function.
 */
function createSubmitEvent(entries: Record<string, string>) {
  const mockReset = vi.fn();
  const event = new Event('submit', { cancelable: true });
  Object.defineProperty(event, 'target', {
    value: { reset: mockReset },
  });

  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    fd.append(key, value);
  }

  const OriginalFormData = globalThis.FormData;
  globalThis.FormData = class extends OriginalFormData {
    constructor(_formElement?: HTMLFormElement) {
      super();
      for (const [k, v] of fd.entries()) {
        this.append(k, v);
      }
    }
  };

  const cleanup = () => {
    globalThis.FormData = OriginalFormData;
  };

  return { event, mockReset, cleanup };
}

describe('form', () => {
  describe('attrs()', () => {
    it('returns action, method, and onSubmit from SDK method metadata', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });
      const attrs = f.attrs();

      expect(attrs.action).toBe('/api/users');
      expect(attrs.method).toBe('POST');
      expect(typeof attrs.onSubmit).toBe('function');
    });

    it('preserves the method casing from SDK metadata', () => {
      const sdk = mockSdkMethod({
        url: '/api/items',
        method: 'PUT',
        handler: async () => ({}),
      });

      const f = form(sdk, { schema: passingSchema() });
      const attrs = f.attrs();

      expect(attrs.action).toBe('/api/items');
      expect(attrs.method).toBe('PUT');
    });

    it('threads callbacks through to onSubmit handler', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1, name: 'Alice' });
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });

      const f = form(sdk, { schema: passingSchema() });
      const onSuccess = vi.fn();

      // attrs() and handleSubmit() share the same handler logic,
      // so we verify callbacks thread through by using handleSubmit with FormData
      const fd = new FormData();
      fd.append('name', 'Alice');
      await f.attrs({ onSuccess }).onSubmit(fd as FormData & Event);

      expect(handler).toHaveBeenCalledWith({ name: 'Alice' });
      expect(onSuccess).toHaveBeenCalledWith({ id: 1, name: 'Alice' });
    });

    it('threads onError through to onSubmit handler', async () => {
      const handler = vi.fn().mockResolvedValue({});
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });
      const schema = failingSchema<{ name: string }>({ name: 'Name is required' });

      const f = form(sdk, { schema });
      const onError = vi.fn();

      const fd = new FormData();
      fd.append('name', '');
      await f.attrs({ onError }).onSubmit(fd as FormData & Event);

      expect(handler).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledWith({ name: 'Name is required' });
    });

    it('returns independent handlers when called multiple times', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });

      const f = form(sdk, { schema: passingSchema() });

      const onSuccessA = vi.fn();
      const onSuccessB = vi.fn();

      const attrsA = f.attrs({ onSuccess: onSuccessA });
      const attrsB = f.attrs({ onSuccess: onSuccessB });

      const fd = new FormData();
      fd.append('name', 'Alice');

      // Call only attrsA's handler
      await attrsA.onSubmit(fd as FormData & Event);

      expect(onSuccessA).toHaveBeenCalledWith({ id: 1 });
      expect(onSuccessB).not.toHaveBeenCalled();
    });

    it('onSubmit works without callbacks', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler,
      });

      const f = form(sdk, { schema: passingSchema() });

      const fd = new FormData();
      fd.append('name', 'Alice');
      await f.attrs().onSubmit(fd as FormData & Event);

      expect(handler).toHaveBeenCalled();
    });

    it('onSubmit with resetOnSuccess resets the form element on success', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
      const f = form(sdk, { schema: passingSchema() });
      const { event, mockReset, cleanup } = createSubmitEvent({ name: 'Alice' });

      try {
        await f.handleSubmit({ resetOnSuccess: true })(event);
        expect(mockReset).toHaveBeenCalled();
      } finally {
        cleanup();
      }
    });

    it('onSubmit with resetOnSuccess does NOT reset the form when SDK throws', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Server error'));
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
      const f = form(sdk, { schema: passingSchema() });
      const { event, mockReset, cleanup } = createSubmitEvent({ name: 'Alice' });

      try {
        await f.handleSubmit({ resetOnSuccess: true, onError: () => {} })(event);
        expect(mockReset).not.toHaveBeenCalled();
      } finally {
        cleanup();
      }
    });

    it('onSubmit without resetOnSuccess does not reset the form', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
      const f = form(sdk, { schema: passingSchema() });
      const { event, mockReset, cleanup } = createSubmitEvent({ name: 'Alice' });

      try {
        await f.handleSubmit()(event);
        expect(mockReset).not.toHaveBeenCalled();
      } finally {
        cleanup();
      }
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

  describe('meta.bodySchema auto-extraction', () => {
    /** Helper: creates a mock SDK method with .meta.bodySchema. */
    function mockSdkWithMeta<TBody, TResult>(config: {
      url: string;
      method: string;
      handler: (body: TBody) => Promise<TResult>;
      bodySchema: FormSchema<TBody>;
    }): SdkMethodWithMeta<TBody, TResult> {
      return Object.assign(config.handler, {
        url: config.url,
        method: config.method,
        meta: { bodySchema: config.bodySchema },
      });
    }

    it('auto-validates using meta.bodySchema when no explicit schema provided', async () => {
      const handler = vi.fn().mockResolvedValue({ id: '1', title: 'Buy milk' });
      const bodySchema = s.object({ title: s.string().min(1) });
      const sdk = mockSdkWithMeta({
        url: '/api/todos',
        method: 'POST',
        handler,
        bodySchema,
      });

      const f = form(sdk);

      // Empty title should fail validation
      const fd1 = new FormData();
      fd1.append('title', '');
      const onError = vi.fn();
      await f.handleSubmit({ onError })(fd1);

      expect(handler).not.toHaveBeenCalled();
      expect(f.error('title')).toBeDefined();
      expect(onError).toHaveBeenCalled();

      // Valid title should pass
      const fd2 = new FormData();
      fd2.append('title', 'Buy milk');
      const onSuccess = vi.fn();
      await f.handleSubmit({ onSuccess })(fd2);

      expect(handler).toHaveBeenCalledWith({ title: 'Buy milk' });
      expect(onSuccess).toHaveBeenCalledWith({ id: '1', title: 'Buy milk' });
    });

    it('explicit schema overrides meta.bodySchema', async () => {
      const handler = vi.fn().mockResolvedValue({ id: '1' });
      // Meta schema allows empty strings
      const metaSchema: FormSchema<{ title: string }> = {
        parse(data: unknown) {
          return data as { title: string };
        },
      };
      // Explicit schema rejects empty strings
      const explicitSchema = s.object({ title: s.string().min(1) });

      const sdk = mockSdkWithMeta({
        url: '/api/todos',
        method: 'POST',
        handler,
        bodySchema: metaSchema,
      });

      const f = form(sdk, { schema: explicitSchema });

      const fd = new FormData();
      fd.append('title', '');
      const onError = vi.fn();
      await f.handleSubmit({ onError })(fd);

      // Explicit schema should win — empty title rejected
      expect(handler).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });

    it('works without any callbacks', async () => {
      const handler = vi.fn().mockResolvedValue({ id: '1' });
      const bodySchema = s.object({ title: s.string() });
      const sdk = mockSdkWithMeta({
        url: '/api/todos',
        method: 'POST',
        handler,
        bodySchema,
      });

      const f = form(sdk);

      const fd = new FormData();
      fd.append('title', 'Hello');
      await f.handleSubmit()(fd);

      expect(handler).toHaveBeenCalled();
    });

    it('attrs() returns correct action and method from SDK meta', () => {
      const bodySchema = s.object({ title: s.string() });
      const sdk = mockSdkWithMeta({
        url: '/api/todos',
        method: 'POST',
        handler: async () => ({ id: '1' }),
        bodySchema,
      });

      const f = form(sdk);
      const attrs = f.attrs();

      expect(attrs.action).toBe('/api/todos');
      expect(attrs.method).toBe('POST');
      expect(typeof attrs.onSubmit).toBe('function');
    });
  });
});
