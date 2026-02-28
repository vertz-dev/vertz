import { describe, expect, it, vi } from 'bun:test';
import { err, ok } from '@vertz/fetch';
import { s } from '@vertz/schema';
import type { SdkMethodWithMeta } from '../form';
import { form } from '../form';
import type { FormSchema } from '../validation';

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

/** Helper: creates a mock SDK method with .meta.bodySchema. */
function mockSdkWithMeta<TBody, TResult>(config: {
  url: string;
  method: string;
  handler: (body: TBody) => Promise<TResult>;
  bodySchema: FormSchema<TBody>;
}): SdkMethodWithMeta<TBody, TResult> {
  const wrappedHandler = async (body: TBody) => ok(await config.handler(body));
  return Object.assign(wrappedHandler, {
    url: config.url,
    method: config.method,
    meta: { bodySchema: config.bodySchema },
  }) as SdkMethodWithMeta<TBody, TResult>;
}

describe('form', () => {
  describe('direct properties', () => {
    it('form().action returns SDK url', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });
      expect(f.action).toBe('/api/users');
    });

    it('form().method returns SDK method', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });
      expect(f.method).toBe('POST');
    });

    it('form().onSubmit is a function', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });
      expect(typeof f.onSubmit).toBe('function');
    });
  });

  describe('onSubmit', () => {
    it('validates and calls SDK on success', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
      const { event, cleanup } = createSubmitEvent({ name: 'Alice' });

      try {
        const f = form(sdk, { schema: passingSchema() });
        await f.onSubmit(event);
        expect(handler).toHaveBeenCalledWith({ name: 'Alice' });
      } finally {
        cleanup();
      }
    });

    it('calls onSuccess callback from options', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
      const onSuccess = vi.fn();
      const { event, cleanup } = createSubmitEvent({ name: 'Alice' });

      try {
        const f = form(sdk, { schema: passingSchema(), onSuccess });
        await f.onSubmit(event);
        expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
      } finally {
        cleanup();
      }
    });

    it('calls onError callback on validation failure', async () => {
      const handler = vi.fn();
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
      const schema = failingSchema<{ name: string }>({ name: 'Required' });
      const onError = vi.fn();
      const { event, cleanup } = createSubmitEvent({ name: '' });

      try {
        const f = form(sdk, { schema, onError });
        await f.onSubmit(event);
        expect(handler).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith({ name: 'Required' });
      } finally {
        cleanup();
      }
    });

    it('calls onError callback on SDK error', async () => {
      const errorSdk = Object.assign(async () => err(new Error('Server error')), {
        url: '/api/users',
        method: 'POST',
      });
      const onError = vi.fn();
      const { event, cleanup } = createSubmitEvent({ name: 'Alice' });

      try {
        const f = form(errorSdk, { schema: passingSchema(), onError });
        await f.onSubmit(event);
        expect(onError).toHaveBeenCalledWith({ _form: 'Server error' });
      } finally {
        cleanup();
      }
    });
  });

  describe('submitting', () => {
    it('starts false, true during submission, false after', async () => {
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
      expect(f.submitting.peek()).toBe(false);

      const fd = new FormData();
      fd.append('name', 'Alice');
      const submitPromise = f.submit(fd);

      expect(f.submitting.peek()).toBe(true);

      resolveHandler({ id: 1 });
      await submitPromise;

      expect(f.submitting.peek()).toBe(false);
    });
  });

  describe('field state via Proxy', () => {
    it('field.error starts as undefined', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });
      expect(f.email.error.peek()).toBeUndefined();
    });

    it('setFieldError sets field error signal', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });
      f.setFieldError('email', 'Taken');
      expect(f.email.error.peek()).toBe('Taken');
    });

    it('Proxy lazily creates field state and caches it', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });

      // First access creates field state
      const field1 = f.email;
      // Second access returns the same cached field state
      const field2 = f.email;
      expect(field1).toBe(field2);
    });
  });

  describe('submit', () => {
    it('submit(formData) triggers submission pipeline', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
      const onSuccess = vi.fn();

      const f = form(sdk, { schema: passingSchema(), onSuccess });

      const fd = new FormData();
      fd.append('name', 'Alice');
      await f.submit(fd);

      expect(handler).toHaveBeenCalledWith({ name: 'Alice' });
      expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
    });
  });

  describe('reset', () => {
    it('reset() clears all errors', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema() });
      f.setFieldError('email', 'Taken');
      f.setFieldError('name', 'Required');

      expect(f.email.error.peek()).toBe('Taken');
      expect(f.name.error.peek()).toBe('Required');

      f.reset();

      expect(f.email.error.peek()).toBeUndefined();
      expect(f.name.error.peek()).toBeUndefined();
    });
  });

  describe('resetOnSuccess', () => {
    it('resets after successful submission', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });

      const f = form(sdk, {
        schema: passingSchema(),
        resetOnSuccess: true,
      });

      // Set some field state
      f.setFieldError('name', 'Required');
      expect(f.name.error.peek()).toBe('Required');

      const fd = new FormData();
      fd.append('name', 'Alice');
      await f.submit(fd);

      // After successful submission with resetOnSuccess, errors should be cleared
      expect(f.name.error.peek()).toBeUndefined();
    });
  });

  describe('meta.bodySchema auto-extraction', () => {
    it('auto-validates using meta.bodySchema when no explicit schema provided', async () => {
      const handler = vi.fn().mockResolvedValue({ id: '1', title: 'Buy milk' });
      const bodySchema = s.object({ title: s.string().min(1) });
      const sdk = mockSdkWithMeta({
        url: '/api/todos',
        method: 'POST',
        handler,
        bodySchema,
      });

      const onError = vi.fn();
      const f = form(sdk, { onError });

      // Empty title should fail validation
      const fd1 = new FormData();
      fd1.append('title', '');
      await f.submit(fd1);

      expect(handler).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();

      // Valid title should pass
      const fd2 = new FormData();
      fd2.append('title', 'Buy milk');
      const onSuccess = vi.fn();
      const f2 = form(sdk, { onSuccess });
      await f2.submit(fd2);

      expect(handler).toHaveBeenCalledWith({ title: 'Buy milk' });
      expect(onSuccess).toHaveBeenCalledWith({ id: '1', title: 'Buy milk' });
    });

    it('explicit schema overrides meta.bodySchema', async () => {
      const handler = vi.fn().mockResolvedValue({ id: '1' });
      const metaSchema: FormSchema<{ title: string }> = {
        parse(data: unknown) {
          return data as { title: string };
        },
      };
      const explicitSchema = s.object({ title: s.string().min(1) });

      const sdk = mockSdkWithMeta({
        url: '/api/todos',
        method: 'POST',
        handler,
        bodySchema: metaSchema,
      });

      const onError = vi.fn();
      const f = form(sdk, { schema: explicitSchema, onError });

      const fd = new FormData();
      fd.append('title', '');
      await f.submit(fd);

      expect(handler).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('__bindElement', () => {
    /** Helper: creates a mock HTMLFormElement with event listener support. */
    function createMockFormElement() {
      const listeners: Record<string, ((e: Event) => void)[]> = {};
      const mockReset = vi.fn();
      const el = {
        addEventListener: vi.fn((type: string, handler: (e: Event) => void) => {
          if (!listeners[type]) listeners[type] = [];
          listeners[type].push(handler);
        }),
        removeEventListener: vi.fn(),
        reset: mockReset,
        dispatchEvent(e: Event) {
          const handlers = listeners[e.type] || [];
          for (const h of handlers) h(e);
        },
      } as unknown as HTMLFormElement;
      return { el, listeners, mockReset };
    }

    /** Helper: creates an input event targeting a named input. */
    function createInputEvent(name: string, value: string, type = 'input') {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, 'target', {
        value: { name, value },
      });
      return event;
    }

    /** Helper: creates a focusout event targeting a named input. */
    function createFocusoutEvent(name: string) {
      const event = new Event('focusout', { bubbles: true });
      Object.defineProperty(event, 'target', {
        value: { name },
      });
      return event;
    }

    it('registers event listeners on element', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });
      const { el } = createMockFormElement();

      f.__bindElement(el);

      expect(el.addEventListener).toHaveBeenCalledWith('input', expect.any(Function));
      expect(el.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(el.addEventListener).toHaveBeenCalledWith('focusout', expect.any(Function));
    });

    it('input event updates field.value', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });
      const { el } = createMockFormElement();

      f.__bindElement(el);
      el.dispatchEvent(createInputEvent('title', 'Hello'));

      expect(f.title.value.peek()).toBe('Hello');
    });

    it('input event updates field.dirty compared to initial', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema(), initial: { title: 'Original' } });
      const { el } = createMockFormElement();

      f.__bindElement(el);

      // Different from initial — dirty
      el.dispatchEvent(createInputEvent('title', 'Changed'));
      expect(f.title.dirty.peek()).toBe(true);

      // Same as initial — not dirty
      el.dispatchEvent(createInputEvent('title', 'Original'));
      expect(f.title.dirty.peek()).toBe(false);
    });

    it('focusout event updates field.touched', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });
      const { el } = createMockFormElement();

      f.__bindElement(el);

      expect(f.title.touched.peek()).toBe(false);
      el.dispatchEvent(createFocusoutEvent('title'));
      expect(f.title.touched.peek()).toBe(true);
    });

    it('submit() without args uses bound element FormData', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });
      const onSuccess = vi.fn();
      const f = form(sdk, { schema: passingSchema(), onSuccess });

      // Create a mock element that produces FormData when constructed
      const fd = new FormData();
      fd.append('name', 'Alice');
      const OriginalFormData = globalThis.FormData;
      const { el } = createMockFormElement();

      globalThis.FormData = class extends OriginalFormData {
        constructor(_formElement?: HTMLFormElement) {
          super();
          for (const [k, v] of fd.entries()) {
            this.append(k, v);
          }
        }
      };

      try {
        f.__bindElement(el);
        await f.submit();
        expect(handler).toHaveBeenCalledWith({ name: 'Alice' });
        expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
      } finally {
        globalThis.FormData = OriginalFormData;
      }
    });

    it('resetOnSuccess calls formElement.reset() on success', async () => {
      const handler = vi.fn().mockResolvedValue({ id: 1 });
      const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });

      const f = form(sdk, { schema: passingSchema(), resetOnSuccess: true });
      const { el, mockReset } = createMockFormElement();

      const fd = new FormData();
      fd.append('name', 'Alice');
      const OriginalFormData = globalThis.FormData;

      globalThis.FormData = class extends OriginalFormData {
        constructor(_formElement?: HTMLFormElement) {
          super();
          for (const [k, v] of fd.entries()) {
            this.append(k, v);
          }
        }
      };

      try {
        f.__bindElement(el);
        await f.submit();
        expect(mockReset).toHaveBeenCalled();
      } finally {
        globalThis.FormData = OriginalFormData;
      }
    });
  });

  describe('per-field setValue and reset', () => {
    it('field.setValue() updates value and dirty through form proxy', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema(), initial: { title: 'Original' } });

      f.title.setValue('Changed');
      expect(f.title.value.peek()).toBe('Changed');
      expect(f.title.dirty.peek()).toBe(true);
    });

    it('field.setValue() back to initial clears dirty', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, { schema: passingSchema(), initial: { title: 'Original' } });

      f.title.setValue('Changed');
      expect(f.title.dirty.peek()).toBe(true);

      f.title.setValue('Original');
      expect(f.title.dirty.peek()).toBe(false);
    });

    it('field.reset() restores single field without affecting others', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });

      const f = form(sdk, {
        schema: passingSchema(),
        initial: { title: 'Original', name: 'Alice' },
      });

      // Modify both fields
      f.title.setValue('Changed title');
      f.name.setValue('Bob');
      f.setFieldError('title', 'Too long');

      // Reset only title
      f.title.reset();

      expect(f.title.value.peek()).toBe('Original');
      expect(f.title.error.peek()).toBeUndefined();
      expect(f.title.dirty.peek()).toBe(false);

      // Name should be untouched
      expect(f.name.value.peek()).toBe('Bob');
      expect(f.name.dirty.peek()).toBe(true);
    });
  });

  describe('computed dirty and valid', () => {
    it('dirty starts as false', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });
      expect(f.dirty.peek()).toBe(false);
    });

    it('dirty becomes true when a field is marked dirty', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });

      // Access and dirty a field
      f.name.dirty.value = true;
      expect(f.dirty.peek()).toBe(true);
    });

    it('dirty returns to false after reset()', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });

      f.name.dirty.value = true;
      expect(f.dirty.peek()).toBe(true);

      f.reset();
      expect(f.dirty.peek()).toBe(false);
    });

    it('valid starts as true (no errors)', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });
      expect(f.valid.peek()).toBe(true);
    });

    it('valid becomes false after setFieldError', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });

      f.setFieldError('title', 'Required');
      expect(f.valid.peek()).toBe(false);
    });

    it('valid returns to true after clearing field error', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });

      f.setFieldError('title', 'Required');
      expect(f.valid.peek()).toBe(false);

      f.title.error.value = undefined;
      expect(f.valid.peek()).toBe(true);
    });

    it('dirty reacts to field added after first evaluation', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });

      // Evaluate dirty first — cache is empty
      expect(f.dirty.peek()).toBe(false);

      // Now create a field and mark it dirty
      f.name.dirty.value = true;

      // dirty should reflect the new field
      expect(f.dirty.peek()).toBe(true);
    });

    it('valid reacts to field error added after first evaluation', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });

      // Evaluate valid first — cache is empty
      expect(f.valid.peek()).toBe(true);

      // Now create a field with an error
      f.setFieldError('email', 'Required');

      // valid should reflect the new field's error
      expect(f.valid.peek()).toBe(false);
    });

    it('reset() clears all field errors, dirty, and touched', () => {
      const sdk = mockSdkMethod({
        url: '/api/users',
        method: 'POST',
        handler: async () => ({ id: 1 }),
      });
      const f = form(sdk, { schema: passingSchema() });

      f.setFieldError('name', 'Required');
      f.name.dirty.value = true;
      f.name.touched.value = true;
      f.setFieldError('email', 'Invalid');
      f.email.dirty.value = true;

      expect(f.valid.peek()).toBe(false);
      expect(f.dirty.peek()).toBe(true);

      f.reset();

      expect(f.name.error.peek()).toBeUndefined();
      expect(f.name.dirty.peek()).toBe(false);
      expect(f.name.touched.peek()).toBe(false);
      expect(f.email.error.peek()).toBeUndefined();
      expect(f.email.dirty.peek()).toBe(false);
      expect(f.valid.peek()).toBe(true);
      expect(f.dirty.peek()).toBe(false);
    });
  });
});
