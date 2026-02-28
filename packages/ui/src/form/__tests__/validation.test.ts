import { describe, expect, it } from 'bun:test';
import { s } from '@vertz/schema';
import type { FormSchema, ValidationResult } from '../validation';
import { validate } from '../validation';

describe('validate', () => {
  it('returns success with parsed data when schema.parse succeeds', () => {
    const schema: FormSchema<{ name: string }> = {
      parse(data: unknown) {
        const obj = data as { name: string };
        if (typeof obj.name !== 'string' || obj.name.length === 0) {
          return { ok: false, error: new Error('Name is required') };
        }
        return { ok: true, data: obj };
      },
    };

    const result = validate(schema, { name: 'Alice' });

    expect(result.success).toBe(true);
    expect((result as ValidationResult<{ name: string }> & { success: true }).data).toEqual({
      name: 'Alice',
    });
    expect(result.errors).toEqual({});
  });

  it('returns failure with field errors when schema.parse returns error with fieldErrors', () => {
    const schema: FormSchema<{ name: string; email: string }> = {
      parse(data: unknown) {
        const obj = data as { name: string; email: string };
        const errors: Record<string, string> = {};
        if (!obj.name) {
          errors.name = 'Name is required';
        }
        if (!obj.email) {
          errors.email = 'Email is required';
        }
        if (Object.keys(errors).length > 0) {
          const err = new Error('Validation failed');
          (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = errors;
          return { ok: false, error: err };
        }
        return { ok: true, data: obj };
      },
    };

    const result = validate(schema, { name: '', email: '' });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual({
      name: 'Name is required',
      email: 'Email is required',
    });
  });

  it('returns a generic form error when schema.parse returns a plain Error', () => {
    const schema: FormSchema<{ name: string }> = {
      parse(_data: unknown) {
        return { ok: false, error: new Error('Invalid input') };
      },
    };

    const result = validate(schema, { name: '' });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual({ _form: 'Invalid input' });
  });

  it('returns a generic form error when schema.parse returns a non-Error', () => {
    const schema: FormSchema<{ name: string }> = {
      parse(_data: unknown) {
        return { ok: false, error: 'something went wrong' };
      },
    };

    const result = validate(schema, { name: '' });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual({ _form: 'Validation failed' });
  });

  describe('ParseError with .issues array', () => {
    it('returns field error for single issue with path', () => {
      const schema: FormSchema<{ title: string }> = {
        parse(_data: unknown) {
          const err = new Error('Validation failed');
          (err as Error & { issues: { path: (string | number)[]; message: string }[] }).issues = [
            { path: ['title'], message: 'Required' },
          ];
          return { ok: false, error: err };
        },
      };

      const result = validate(schema, {});

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({ title: 'Required' });
    });

    it('returns all field errors for multiple issues', () => {
      const schema: FormSchema<{ title: string; email: string }> = {
        parse(_data: unknown) {
          const err = new Error('Validation failed');
          (err as Error & { issues: { path: (string | number)[]; message: string }[] }).issues = [
            { path: ['title'], message: 'Title is required' },
            { path: ['email'], message: 'Email is invalid' },
          ];
          return { ok: false, error: err };
        },
      };

      const result = validate(schema, {});

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({
        title: 'Title is required',
        email: 'Email is invalid',
      });
    });

    it('uses first issue per field when duplicates exist', () => {
      const schema: FormSchema<{ title: string }> = {
        parse(_data: unknown) {
          const err = new Error('Validation failed');
          (err as Error & { issues: { path: (string | number)[]; message: string }[] }).issues = [
            { path: ['title'], message: 'Too short' },
            { path: ['title'], message: 'Must start with uppercase' },
          ];
          return { ok: false, error: err };
        },
      };

      const result = validate(schema, {});

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({ title: 'Too short' });
    });

    it('maps empty path to _form key', () => {
      const schema: FormSchema<{ title: string }> = {
        parse(_data: unknown) {
          const err = new Error('Validation failed');
          (err as Error & { issues: { path: (string | number)[]; message: string }[] }).issues = [
            { path: [], message: 'Invalid object' },
          ];
          return { ok: false, error: err };
        },
      };

      const result = validate(schema, {});

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({ _form: 'Invalid object' });
    });

    it('uses dot-notation for nested path', () => {
      const schema: FormSchema<{ address: { street: string } }> = {
        parse(_data: unknown) {
          const err = new Error('Validation failed');
          (err as Error & { issues: { path: (string | number)[]; message: string }[] }).issues = [
            { path: ['address', 'street'], message: 'Street is required' },
          ];
          return { ok: false, error: err };
        },
      };

      const result = validate(schema, {});

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({ 'address.street': 'Street is required' });
    });

    it('works end-to-end with real @vertz/schema ParseError', () => {
      const schema = s.object({
        title: s.string().min(1),
        count: s.number(),
      });

      const result = validate(schema, { title: '', count: 'not-a-number' });

      expect(result.success).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.count).toBeDefined();
    });

    it('fieldErrors convention takes precedence over .issues', () => {
      const schema: FormSchema<{ title: string }> = {
        parse(_data: unknown) {
          const err = new Error('Validation failed');
          (
            err as Error & {
              fieldErrors: Record<string, string>;
              issues: { path: (string | number)[]; message: string }[];
            }
          ).fieldErrors = { title: 'From fieldErrors' };
          (
            err as Error & {
              issues: { path: (string | number)[]; message: string }[];
            }
          ).issues = [{ path: ['title'], message: 'From issues' }];
          return { ok: false, error: err };
        },
      };

      const result = validate(schema, {});

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({ title: 'From fieldErrors' });
    });
  });
});
