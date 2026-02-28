/**
 * SDK Schema Integration — Developer Walkthrough Test
 *
 * Validates that form() auto-extracts validation schema from
 * SdkMethod.meta.bodySchema (simulating generated SDK output).
 *
 * Uses only public package imports — never relative imports.
 */

import { ok } from '@vertz/fetch';
import { s } from '@vertz/schema';
import { form } from '@vertz/ui/form';
import { describe, expect, it, vi } from 'vitest';

describe('SDK Schema Integration', () => {
  // Mock SDK method with .meta.bodySchema (simulates generated SDK)
  const schema = s.object({ title: s.string().min(1) });
  const createTodo = Object.assign(async (body: { title: string }) => ok({ id: '1', ...body }), {
    url: '/todos',
    method: 'POST',
    meta: { bodySchema: schema },
  });

  it('form() auto-validates from SDK meta.bodySchema', async () => {
    const onError = vi.fn();
    const f = form(createTodo, { onError });

    const fd = new FormData();
    fd.append('title', '');
    await f.submit(fd);

    expect(onError).toHaveBeenCalled();
    expect(f.title.error.peek()).toBeDefined();
  });

  it('form() passes valid data through to SDK method', async () => {
    const onSuccess = vi.fn();
    const f = form(createTodo, { onSuccess });

    const fd = new FormData();
    fd.append('title', 'Buy milk');
    await f.submit(fd);

    expect(onSuccess).toHaveBeenCalledWith({ id: '1', title: 'Buy milk' });
    expect(f.title.error.peek()).toBeUndefined();
  });

  it('form() requires explicit schema when SDK lacks meta', () => {
    const plainSdk = Object.assign(async (body: { title: string }) => ok({ id: '1', ...body }), {
      url: '/todos',
      method: 'POST',
    });

    // @ts-expect-error — SDK without .meta requires explicit schema
    form(plainSdk);
  });

  it('form() allows explicit schema to override meta.bodySchema', async () => {
    // Custom schema that rejects titles shorter than 5 chars
    const strictSchema = s.object({ title: s.string().min(5) });
    const onError = vi.fn();
    const f = form(createTodo, { schema: strictSchema, onError });

    const fd = new FormData();
    fd.append('title', 'Hi'); // valid for meta schema (min 1) but not for explicit (min 5)
    await f.submit(fd);

    expect(onError).toHaveBeenCalled();
    expect(f.title.error.peek()).toBeDefined();
  });
});
