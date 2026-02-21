/**
 * SDK Schema Integration — Developer Walkthrough Test
 *
 * Validates that form() auto-extracts validation schema from
 * SdkMethod.meta.bodySchema (simulating generated SDK output).
 *
 * Uses only public package imports — never relative imports.
 */
import { form } from '@vertz/ui/form';
import { s } from '@vertz/schema';
import { describe, expect, it, vi } from 'vitest';

describe('SDK Schema Integration', () => {
  // Mock SDK method with .meta.bodySchema (simulates generated SDK)
  const schema = s.object({ title: s.string().min(1) });
  const createTodo = Object.assign(
    async (body: { title: string }) => ({ id: '1', ...body }),
    { url: '/todos', method: 'POST', meta: { bodySchema: schema } },
  );

  it('form() auto-validates from SDK meta.bodySchema', async () => {
    const f = form(createTodo);
    const onError = vi.fn();

    const fd = new FormData();
    fd.append('title', '');
    await f.handleSubmit({ onError })(fd);

    expect(onError).toHaveBeenCalled();
    expect(f.error('title')).toBeDefined();
  });

  it('form() passes valid data through to SDK method', async () => {
    const f = form(createTodo);
    const onSuccess = vi.fn();

    const fd = new FormData();
    fd.append('title', 'Buy milk');
    await f.handleSubmit({ onSuccess })(fd);

    expect(onSuccess).toHaveBeenCalledWith({ id: '1', title: 'Buy milk' });
    expect(f.error('title')).toBeUndefined();
  });

  it('form() requires explicit schema when SDK lacks meta', () => {
    const plainSdk = Object.assign(
      async (body: { title: string }) => ({ id: '1', ...body }),
      { url: '/todos', method: 'POST' },
    );

    // @ts-expect-error — SDK without .meta requires explicit schema
    form(plainSdk);
  });

  it('form() allows explicit schema to override meta.bodySchema', async () => {
    // Custom schema that rejects titles shorter than 5 chars
    const strictSchema = s.object({ title: s.string().min(5) });
    const f = form(createTodo, { schema: strictSchema });
    const onError = vi.fn();

    const fd = new FormData();
    fd.append('title', 'Hi'); // valid for meta schema (min 1) but not for explicit (min 5)
    await f.handleSubmit({ onError })(fd);

    expect(onError).toHaveBeenCalled();
    expect(f.error('title')).toBeDefined();
  });
});
