import { describe, expect, it, mock } from '@vertz/test';
import { ok } from '@vertz/fetch';
import { s } from '@vertz/schema';
import type { SdkMethodWithMeta } from '../form';
import { form } from '../form';
import type { FormSchema } from '../validation';

function createMockFormElement() {
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  const mockReset = mock();
  const el = {
    addEventListener: (type: string, handler: (e: Event) => void) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: () => {},
    reset: mockReset,
    dispatchEvent(e: Event) {
      const handlers = listeners[e.type] || [];
      for (const h of handlers) h(e);
      return true;
    },
  } as unknown as HTMLFormElement;
  return { el, listeners };
}

function createSubmitEventFromFormData(fd: FormData) {
  const mockReset = mock();
  const event = new Event('submit', { cancelable: true });
  Object.defineProperty(event, 'target', { value: { reset: mockReset } });

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

  return { event, cleanup };
}

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

describe('Feature: form() FormData coercion', () => {
  describe('Given a boolean field whose checkbox is checked (value="on")', () => {
    describe('When the form is submitted', () => {
      it('then the SDK receives true for that field', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s.object({ active: s.boolean() });
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('active', 'on');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ active: true });
        } finally {
          cleanup();
        }
      });
    });
  });

  describe('Given a boolean field whose checkbox is unchecked (key absent)', () => {
    describe('When the form is submitted', () => {
      it('then the SDK receives false for that field', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s.object({ active: s.boolean() });
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ active: false });
        } finally {
          cleanup();
        }
      });
    });
  });

  describe('Given a boolean field whose explicit value is "false"', () => {
    describe('When the form is submitted', () => {
      it('then the SDK receives false (not the string "false")', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s.object({ active: s.boolean() });
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('active', 'false');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ active: false });
        } finally {
          cleanup();
        }
      });
    });
  });

  describe('Given a number field with value "42"', () => {
    describe('When the form is submitted', () => {
      it('then the SDK receives the number 42', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s.object({ priority: s.number() });
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('priority', '42');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ priority: 42 });
        } finally {
          cleanup();
        }
      });
    });
  });

  describe('Given a number field with value "0"', () => {
    describe('When the form is submitted', () => {
      it('then the SDK receives the number 0 (not dropped)', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s.object({ priority: s.number() });
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('priority', '0');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ priority: 0 });
        } finally {
          cleanup();
        }
      });
    });
  });

  describe('Given a number field with empty string and a default()', () => {
    describe('When the form is submitted', () => {
      it('then validation succeeds (empty value dropped so default() applies during parse)', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s.object({ priority: s.number().default(5) });
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('priority', '');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledTimes(1);
          expect(handler).toHaveBeenCalledWith({});
        } finally {
          cleanup();
        }
      });
    });
  });

  describe('Given a multi-checkbox tags field', () => {
    describe('When the form is submitted with two values', () => {
      it('then the SDK receives a string array of both values', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s.object({ tags: s.array(s.string()) });
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('tags', 'a');
        fd.append('tags', 'b');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ tags: ['a', 'b'] });
        } finally {
          cleanup();
        }
      });
    });
  });

  describe('Given a string field with a numeric-looking value "42"', () => {
    describe('When the form is submitted', () => {
      it('then the SDK receives the string "42" (never coerced)', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s.object({ name: s.string() });
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('name', '42');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ name: '42' });
        } finally {
          cleanup();
        }
      });
    });
  });

  describe('Given a number field that previously failed validation', () => {
    describe('When the user fixes the value and the field re-validates on blur', () => {
      it('then the blur-revalidation clears the error (proves coerceLeaf is shared with submit)', async () => {
        const bodySchema = s.object({ priority: s.number() });
        const sdk = mockSdkWithMeta({
          url: '/x',
          method: 'POST',
          handler: async () => ({ id: 1 }),
          bodySchema,
        });

        const { el } = createMockFormElement();
        const f = form(sdk);
        f.__bindElement(el);

        const fd = new FormData();
        fd.append('priority', '');
        await f.submit(fd);
        expect(f.priority.error.peek()).toBeDefined();

        const inputEvent = new Event('input', { bubbles: true });
        Object.defineProperty(inputEvent, 'target', {
          value: { name: 'priority', value: '42' },
        });
        el.dispatchEvent(inputEvent);

        const focusoutEvent = new Event('focusout', { bubbles: true });
        Object.defineProperty(focusoutEvent, 'target', {
          value: { name: 'priority' },
        });
        el.dispatchEvent(focusoutEvent);

        expect(f.priority.error.peek()).toBeUndefined();
      });
    });
  });

  describe('Given a top-level refined object schema (cross-field validation)', () => {
    describe('When the form is submitted with a checkbox checked', () => {
      it('then coercion still runs through the .refine() wrapper', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema = s
          .object({ active: s.boolean(), priority: s.number() })
          .refine((d) => d.priority > 0);
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('active', 'on');
        fd.append('priority', '42');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ active: true, priority: 42 });
        } finally {
          cleanup();
        }
      });
    });

    describe('When a number field on the refined schema fails validation and is later fixed', () => {
      it('then blur revalidation also unwraps the refine and clears the error', async () => {
        const bodySchema = s.object({ priority: s.number() }).refine((d) => d.priority > 0);
        const sdk = mockSdkWithMeta({
          url: '/x',
          method: 'POST',
          handler: async () => ({ id: 1 }),
          bodySchema,
        });

        const { el } = createMockFormElement();
        const f = form(sdk);
        f.__bindElement(el);

        const fd = new FormData();
        fd.append('priority', '');
        await f.submit(fd);
        expect(f.priority.error.peek()).toBeDefined();

        const inputEvent = new Event('input', { bubbles: true });
        Object.defineProperty(inputEvent, 'target', {
          value: { name: 'priority', value: '42' },
        });
        el.dispatchEvent(inputEvent);

        const focusoutEvent = new Event('focusout', { bubbles: true });
        Object.defineProperty(focusoutEvent, 'target', {
          value: { name: 'priority' },
        });
        el.dispatchEvent(focusoutEvent);

        expect(f.priority.error.peek()).toBeUndefined();
      });
    });
  });

  describe('Given a custom schema adapter without _schemaType (no .shape)', () => {
    describe('When the form is submitted', () => {
      it('then submitPipeline falls back to formDataToObject without coercion', async () => {
        const handler = mock().mockResolvedValue({ id: 1 });
        const bodySchema: FormSchema<{ active: string }> = {
          parse: (data) => ({ ok: true, data: data as { active: string } }),
        };
        const sdk = mockSdkWithMeta({ url: '/x', method: 'POST', handler, bodySchema });

        const fd = new FormData();
        fd.append('active', 'on');
        const { event, cleanup } = createSubmitEventFromFormData(fd);
        try {
          const f = form(sdk);
          await f.onSubmit(event);
          expect(handler).toHaveBeenCalledWith({ active: 'on' });
        } finally {
          cleanup();
        }
      });
    });
  });
});
