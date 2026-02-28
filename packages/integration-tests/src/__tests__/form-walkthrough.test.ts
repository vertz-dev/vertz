// ===========================================================================
// Form API Developer Walkthrough — Public API Validation Test
//
// This test validates that a developer can use the full form() API using
// ONLY public imports from @vertz/ui and @vertz/schema. If anything is
// missing from the public exports, this file will fail to compile.
//
// Covers: form creation, direct properties, per-field signals, submission
// pipeline, form-level signals, reset, setFieldError, SDK meta extraction.
//
// Uses only public package imports — never relative imports.
// ===========================================================================

import { err, ok } from '@vertz/errors';
import { s } from '@vertz/schema';
import type { FormOptions, SdkMethod, SdkMethodWithMeta } from '@vertz/ui/form';
import { form, formDataToObject } from '@vertz/ui/form';
import { describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Mock SDK method — simulates generated SDK output
// ---------------------------------------------------------------------------

interface CreateUserBody {
  name: string;
  email: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

/** Mock SDK method with url/method metadata (no .meta). */
function mockSdk(): SdkMethod<CreateUserBody, User> {
  const fn = async (body: CreateUserBody) => ok<User>({
    id: 'u-1',
    ...body,
  });
  return Object.assign(fn, { url: '/api/users', method: 'POST' });
}

/** Mock SDK method WITH .meta.bodySchema (simulates codegen output). */
function mockSdkWithMeta(): SdkMethodWithMeta<CreateUserBody, User> {
  const schema = s.object({
    name: s.string().min(1),
    email: s.string().min(1),
  });
  const fn = async (body: CreateUserBody) => ok<User>({
    id: 'u-1',
    ...body,
  });
  return Object.assign(fn, {
    url: '/api/users',
    method: 'POST',
    meta: { bodySchema: schema },
  });
}

// ---------------------------------------------------------------------------
// 2. Validation schema — using public @vertz/schema API
// ---------------------------------------------------------------------------

const createUserSchema = s.object({
  name: s.string().min(1),
  email: s.string().min(1),
});

// ---------------------------------------------------------------------------
// 3. Walkthrough Tests
// ---------------------------------------------------------------------------

describe('Form API Developer Walkthrough', () => {
  // -------------------------------------------------------------------------
  // 3a. Direct properties — action, method, onSubmit
  // -------------------------------------------------------------------------

  describe('Direct properties', () => {
    it('form() exposes action from SDK url', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.action).toBe('/api/users');
    });

    it('form() exposes method from SDK method', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.method).toBe('POST');
    });

    it('form() exposes onSubmit as a function', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(typeof userForm.onSubmit).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // 3b. Submission — valid data flows through to SDK method
  // -------------------------------------------------------------------------

  describe('Submission pipeline', () => {
    it('submit() calls SDK method with validated data and invokes onSuccess', async () => {
      const onSuccess = vi.fn();
      const userForm = form(mockSdk(), {
        schema: createUserSchema,
        onSuccess,
      });

      const fd = new FormData();
      fd.append('name', 'Alice');
      fd.append('email', 'alice@test.com');
      await userForm.submit(fd);

      expect(onSuccess).toHaveBeenCalledWith({
        id: 'u-1',
        name: 'Alice',
        email: 'alice@test.com',
      });
      expect(userForm.submitting.peek()).toBe(false);
    });

    it('submit() validates and calls onError on invalid data', async () => {
      const onError = vi.fn();
      const userForm = form(mockSdk(), {
        schema: createUserSchema,
        onError,
      });

      const fd = new FormData();
      fd.append('name', '');
      fd.append('email', '');
      await userForm.submit(fd);

      expect(onError).toHaveBeenCalled();
      // SDK method should NOT have been called
      expect(userForm.submitting.peek()).toBe(false);
    });

    it('submit() calls onError when SDK method returns an error result', async () => {
      const failingSdk: SdkMethod<CreateUserBody, User> = Object.assign(
        async () => err(new Error('Server error')),
        { url: '/api/users', method: 'POST' },
      );

      const onError = vi.fn();
      const userForm = form(failingSdk, {
        schema: createUserSchema,
        onError,
      });

      const fd = new FormData();
      fd.append('name', 'Alice');
      fd.append('email', 'alice@test.com');
      await userForm.submit(fd);

      expect(onError).toHaveBeenCalled();
      const errors = onError.mock.calls[0]?.[0] as Record<string, string>;
      expect(errors._form).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3c. Per-field error signals — reactive error access
  // -------------------------------------------------------------------------

  describe('Per-field error signals', () => {
    it('field.error starts as undefined', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.name.error.peek()).toBeUndefined();
      expect(userForm.email.error.peek()).toBeUndefined();
    });

    it('field.error is populated after failed validation', async () => {
      const onError = vi.fn();
      const userForm = form(mockSdk(), {
        schema: createUserSchema,
        onError,
      });

      const fd = new FormData();
      fd.append('name', '');
      fd.append('email', '');
      await userForm.submit(fd);

      expect(userForm.name.error.peek()).toBeDefined();
      expect(userForm.email.error.peek()).toBeDefined();
    });

    it('field.error is cleared after successful submission', async () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });

      // First: trigger validation errors
      const fd1 = new FormData();
      fd1.append('name', '');
      fd1.append('email', '');
      await userForm.submit(fd1);
      expect(userForm.name.error.peek()).toBeDefined();

      // Then: submit valid data — errors should clear
      const fd2 = new FormData();
      fd2.append('name', 'Alice');
      fd2.append('email', 'alice@test.com');
      await userForm.submit(fd2);
      expect(userForm.name.error.peek()).toBeUndefined();
      expect(userForm.email.error.peek()).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3d. setFieldError — server-side validation errors
  // -------------------------------------------------------------------------

  describe('setFieldError', () => {
    it('populates per-field error signal', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });

      userForm.setFieldError('email', 'Already taken');
      expect(userForm.email.error.peek()).toBe('Already taken');
    });

    it('only accepts keyof TBody at compile time', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });

      // Valid: 'name' and 'email' are fields
      userForm.setFieldError('name', 'Too short');
      userForm.setFieldError('email', 'Invalid');

      // @ts-expect-error — 'nonExistent' is not a field on CreateUserBody
      userForm.setFieldError('nonExistent', 'Nope');
    });
  });

  // -------------------------------------------------------------------------
  // 3e. Form-level signals — dirty, valid, submitting
  // -------------------------------------------------------------------------

  describe('Form-level signals', () => {
    it('submitting starts as false', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.submitting.peek()).toBe(false);
    });

    it('dirty starts as false', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.dirty.peek()).toBe(false);
    });

    it('valid starts as true (no errors)', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.valid.peek()).toBe(true);
    });

    it('dirty reacts to field changes (including fields added after first read)', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });

      // Read dirty first — field cache is empty
      expect(userForm.dirty.peek()).toBe(false);

      // Simulate field becoming dirty
      userForm.name.dirty.value = true;
      expect(userForm.dirty.peek()).toBe(true);
    });

    it('valid reacts to field errors (including fields added after first read)', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });

      // Read valid first — field cache is empty
      expect(userForm.valid.peek()).toBe(true);

      // Set a field error
      userForm.setFieldError('email', 'Required');
      expect(userForm.valid.peek()).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 3f. Reset
  // -------------------------------------------------------------------------

  describe('Reset', () => {
    it('reset() clears all field errors, dirty, and touched', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });

      userForm.setFieldError('name', 'Required');
      userForm.name.dirty.value = true;
      userForm.name.touched.value = true;

      userForm.setFieldError('email', 'Invalid');
      userForm.email.dirty.value = true;

      expect(userForm.valid.peek()).toBe(false);
      expect(userForm.dirty.peek()).toBe(true);

      userForm.reset();

      expect(userForm.name.error.peek()).toBeUndefined();
      expect(userForm.name.dirty.peek()).toBe(false);
      expect(userForm.name.touched.peek()).toBe(false);
      expect(userForm.email.error.peek()).toBeUndefined();
      expect(userForm.valid.peek()).toBe(true);
      expect(userForm.dirty.peek()).toBe(false);
    });

    it('resetOnSuccess resets after successful submission', async () => {
      const onSuccess = vi.fn();
      const userForm = form(mockSdk(), {
        schema: createUserSchema,
        onSuccess,
        resetOnSuccess: true,
      });

      // Dirty a field first
      userForm.name.dirty.value = true;
      expect(userForm.dirty.peek()).toBe(true);

      const fd = new FormData();
      fd.append('name', 'Alice');
      fd.append('email', 'alice@test.com');
      await userForm.submit(fd);

      expect(onSuccess).toHaveBeenCalled();
      expect(userForm.dirty.peek()).toBe(false);
      expect(userForm.name.error.peek()).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 3g. SDK meta.bodySchema — auto-extraction
  // -------------------------------------------------------------------------

  describe('SDK meta.bodySchema auto-extraction', () => {
    it('form() auto-validates from .meta.bodySchema (no explicit schema needed)', async () => {
      const onError = vi.fn();
      // No explicit schema — uses .meta.bodySchema
      const userForm = form(mockSdkWithMeta(), { onError });

      const fd = new FormData();
      fd.append('name', '');
      fd.append('email', '');
      await userForm.submit(fd);

      expect(onError).toHaveBeenCalled();
      expect(userForm.name.error.peek()).toBeDefined();
    });

    it('explicit schema overrides .meta.bodySchema', async () => {
      // Stricter schema: name must be >= 5 chars
      const strictSchema = s.object({
        name: s.string().min(5),
        email: s.string().min(1),
      });
      const onError = vi.fn();
      const userForm = form(mockSdkWithMeta(), { schema: strictSchema, onError });

      const fd = new FormData();
      fd.append('name', 'Al'); // valid for meta schema (min 1) but not for explicit (min 5)
      fd.append('email', 'al@test.com');
      await userForm.submit(fd);

      expect(onError).toHaveBeenCalled();
      expect(userForm.name.error.peek()).toBeDefined();
    });

    it('form() without .meta requires explicit schema (type error)', () => {
      const plainSdk = mockSdk(); // no .meta

      // @ts-expect-error — SDK without .meta requires explicit schema
      form(plainSdk);
    });
  });

  // -------------------------------------------------------------------------
  // 3h. Per-field signal state — dirty, touched, value
  // -------------------------------------------------------------------------

  describe('Per-field signal state', () => {
    it('field.dirty starts as false', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.name.dirty.peek()).toBe(false);
    });

    it('field.touched starts as false', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.name.touched.peek()).toBe(false);
    });

    it('field.value starts as undefined (no initial)', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      expect(userForm.name.value.peek()).toBeUndefined();
    });

    it('field.value starts with initial value when provided', () => {
      const userForm = form(mockSdk(), {
        schema: createUserSchema,
        initial: { name: 'Alice', email: 'alice@test.com' },
      });
      expect(userForm.name.value.peek()).toBe('Alice');
      expect(userForm.email.value.peek()).toBe('alice@test.com');
    });

    it('field state is lazily created and cached (same reference)', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });
      const first = userForm.name;
      const second = userForm.name;
      expect(first).toBe(second);
    });
  });

  // -------------------------------------------------------------------------
  // 3i. formDataToObject — utility
  // -------------------------------------------------------------------------

  describe('formDataToObject utility', () => {
    it('converts FormData to plain object', () => {
      const fd = new FormData();
      fd.append('name', 'Alice');
      fd.append('email', 'alice@test.com');
      const obj = formDataToObject(fd);
      expect(obj).toEqual({ name: 'Alice', email: 'alice@test.com' });
    });
  });

  // -------------------------------------------------------------------------
  // 3j. Type safety — compile-time checks
  // -------------------------------------------------------------------------

  describe('Type safety', () => {
    it('FormInstance type is accessible from public imports', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });

      // These type assertions verify the public API types resolve correctly
      const _action: string = userForm.action;
      const _method: string = userForm.method;
      const _onSubmit: (e: Event) => Promise<void> = userForm.onSubmit;
      const _reset: () => void = userForm.reset;
      const _submit: (formData?: FormData) => Promise<void> = userForm.submit;

      // Suppress unused variable warnings
      void [_action, _method, _onSubmit, _reset, _submit];
    });

    it('FormOptions type is accessible from public imports', () => {
      const _opts: FormOptions<CreateUserBody, User> = {
        schema: createUserSchema,
        onSuccess: (_user) => {},
        onError: (_errors) => {},
        resetOnSuccess: true,
      };
      void _opts;
    });

    it('old API methods do not exist', () => {
      const userForm = form(mockSdk(), { schema: createUserSchema });

      // @ts-expect-error — attrs() was removed
      userForm.attrs;

      // @ts-expect-error — error() was removed
      userForm.error;

      // @ts-expect-error — handleSubmit() was removed
      userForm.handleSubmit;
    });
  });
});
