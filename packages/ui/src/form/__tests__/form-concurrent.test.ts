import { describe, expect, it, mock } from '@vertz/test';
import { ok } from '@vertz/fetch';
import { form } from '../form';
import type { FormSchema } from '../validation';

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

function passingSchema<T>(): FormSchema<T> {
  return {
    parse(data: unknown) {
      return { ok: true as const, data: data as T };
    },
  };
}

describe('form concurrent submission', () => {
  it('ignores reentrant submit() calls while one is in flight', async () => {
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });

    const f = form(sdk, { schema: passingSchema() });
    const fd = new FormData();
    fd.append('name', 'Alice');

    const first = f.submit(fd);
    const second = f.submit(fd);

    expect(f.submitting.peek()).toBe(true);

    await Promise.all([first, second]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(f.submitting.peek()).toBe(false);
  });

  it('allows a new submission after the previous one settles', async () => {
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });

    const f = form(sdk, { schema: passingSchema() });
    const fd = new FormData();
    fd.append('name', 'Alice');

    await f.submit(fd);
    await f.submit(fd);

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('ignores reentrant onSubmit calls (double-clicked submit button)', async () => {
    const handler = mock().mockResolvedValue({ id: 1 });
    const onSuccess = mock();
    const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });

    const f = form(sdk, { schema: passingSchema(), resetOnSuccess: true, onSuccess });

    const fd = new FormData();
    fd.append('name', 'Alice');

    const OriginalFormData = globalThis.FormData;
    globalThis.FormData = class extends OriginalFormData {
      constructor(_formElement?: HTMLFormElement) {
        super();
        for (const [k, v] of fd.entries()) this.append(k, v);
      }
    };

    try {
      const firstReset = mock();
      const secondReset = mock();
      const event1 = new Event('submit', { cancelable: true });
      Object.defineProperty(event1, 'target', { value: { reset: firstReset } });
      const event2 = new Event('submit', { cancelable: true });
      Object.defineProperty(event2, 'target', { value: { reset: secondReset } });

      const first = f.onSubmit(event1);
      const second = f.onSubmit(event2);
      await Promise.all([first, second]);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
      // Only the winning call triggers reset; the rejected one must not.
      expect(firstReset).toHaveBeenCalledTimes(1);
      expect(secondReset).not.toHaveBeenCalled();
    } finally {
      globalThis.FormData = OriginalFormData;
    }
  });

  it('releases the lock after a validation failure — same form can submit again', async () => {
    const handler = mock().mockResolvedValue({ id: 1 });
    const sdk = mockSdkMethod({ url: '/api/users', method: 'POST', handler });

    let shouldFail = true;
    const schema: FormSchema<{ name: string }> = {
      parse(data: unknown) {
        if (shouldFail) {
          const error = new Error('Validation failed');
          (error as Error & { fieldErrors: Record<string, string> }).fieldErrors = {
            name: 'Required',
          };
          return { ok: false as const, error };
        }
        return { ok: true as const, data: data as { name: string } };
      },
    };
    const f = form(sdk, { schema });

    const fd1 = new FormData();
    fd1.append('name', '');
    await f.submit(fd1);
    expect(handler).not.toHaveBeenCalled();
    expect(f.submitting.peek()).toBe(false);

    shouldFail = false;
    const fd2 = new FormData();
    fd2.append('name', 'Alice');
    await f.submit(fd2);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
