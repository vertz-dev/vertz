import { describe, expect, it } from 'vitest';
import type { FormSchema, ValidationResult } from '../validation';
import { validate } from '../validation';

describe('validate', () => {
  it('returns success with parsed data when schema.parse succeeds', () => {
    const schema: FormSchema<{ name: string }> = {
      parse(data: unknown) {
        const obj = data as { name: string };
        if (typeof obj.name !== 'string' || obj.name.length === 0) {
          throw new Error('Name is required');
        }
        return obj;
      },
    };

    const result = validate(schema, { name: 'Alice' });

    expect(result.success).toBe(true);
    expect((result as ValidationResult<{ name: string }> & { success: true }).data).toEqual({
      name: 'Alice',
    });
    expect(result.errors).toEqual({});
  });

  it('returns failure with field errors when schema.parse throws a FieldError', () => {
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
          throw err;
        }
        return obj;
      },
    };

    const result = validate(schema, { name: '', email: '' });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual({
      name: 'Name is required',
      email: 'Email is required',
    });
  });

  it('returns a generic form error when schema.parse throws a plain Error', () => {
    const schema: FormSchema<{ name: string }> = {
      parse(_data: unknown) {
        throw new Error('Invalid input');
      },
    };

    const result = validate(schema, { name: '' });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual({ _form: 'Invalid input' });
  });

  it('returns a generic form error when schema.parse throws a non-Error', () => {
    const schema: FormSchema<{ name: string }> = {
      parse(_data: unknown) {
        throw 'something went wrong';
      },
    };

    const result = validate(schema, { name: '' });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual({ _form: 'Validation failed' });
  });
});
