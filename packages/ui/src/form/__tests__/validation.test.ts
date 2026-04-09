import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import type { FormSchema, ValidationResult } from '../validation';
import { validate, validateField } from '../validation';

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

    it('succeeds end-to-end with real @vertz/schema on valid form data', () => {
      const schema = s.object({
        title: s.string(),
        completed: s.unknown().optional(),
      });

      // Simulates FormData → object conversion: only `title` is present
      const result = validate(schema, { title: 'Buy groceries' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ title: 'Buy groceries' });
    });

    it('fails when schema shape does not match form data fields', () => {
      // A schema expecting { ok: boolean } would fail against form data { title: "..." }
      const wrongSchema = s.object({ ok: s.boolean() });

      const result = validate(wrongSchema, { title: 'Buy groceries' });

      expect(result.success).toBe(false);
      expect(result.errors.ok).toBeDefined();
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

describe('validateField', () => {
  describe('Given a schema with .shape (duck-typed)', () => {
    describe('When calling validateField with an invalid value', () => {
      it('Then returns { valid: false, error: "..." } using shape[field].parse()', () => {
        const schema = s.object({ title: s.string().min(1) });
        const result = validateField(schema, 'title', '');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('When calling validateField with a valid value', () => {
      it('Then returns { valid: true, error: undefined }', () => {
        const schema = s.object({ title: s.string().min(1) });
        const result = validateField(schema, 'title', 'Hello');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('Given a schema without .shape', () => {
    describe('When calling validateField with an invalid value and form data', () => {
      it('Then runs full parse and extracts the field error', () => {
        const schema: FormSchema<{ title: string }> = {
          parse(_data: unknown) {
            const obj = _data as { title: string };
            if (!obj.title || obj.title.length === 0) {
              const err = new Error('Validation failed');
              (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = {
                title: 'Title is required',
              };
              return { ok: false, error: err };
            }
            return { ok: true, data: obj };
          },
        };

        const result = validateField(schema, 'title', '', { title: '' });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Title is required');
      });
    });

    describe('When calling validateField with a valid value and form data', () => {
      it('Then returns valid (no error for that field in full parse result)', () => {
        const schema: FormSchema<{ title: string }> = {
          parse(_data: unknown) {
            const obj = _data as { title: string };
            if (!obj.title || obj.title.length === 0) {
              const err = new Error('Validation failed');
              (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = {
                title: 'Title is required',
              };
              return { ok: false, error: err };
            }
            return { ok: true, data: obj };
          },
        };

        const result = validateField(schema, 'title', 'Hello', { title: 'Hello' });
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('Given a nested field path "address.street"', () => {
    describe('When calling validateField with an invalid value', () => {
      it('Then navigates schema.shape.address.shape.street for validation', () => {
        const schema = s.object({
          address: s.object({ street: s.string().min(1) }),
        });
        const result = validateField(schema, 'address.street', '');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('Given a nested field wrapped in OptionalSchema', () => {
    describe('When calling validateField with an invalid value', () => {
      it('Then unwraps OptionalSchema and validates via inner schema shape', () => {
        const schema = s.object({
          address: s.object({ street: s.string().min(1) }).optional(),
        });
        const result = validateField(schema, 'address.street', '');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });
  });

  describe('Given a nested field where intermediate unwrap fails', () => {
    describe('When calling validateField with form data', () => {
      it('Then falls back to full validation and extracts the field error', () => {
        // Schema with .shape but intermediate field has no .shape and no .unwrap
        const schema = {
          shape: {
            address: { parse: () => ({ ok: false, error: new Error('fail') }) },
          },
          parse(_data: unknown) {
            const err = new Error('Validation failed');
            (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = {
              'address.street': 'Street is required',
            };
            return { ok: false, error: err };
          },
        } as unknown as FormSchema<{ address: { street: string } }>;

        const result = validateField(schema, 'address.street', '', {
          address: { street: '' },
        });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Street is required');
      });
    });
  });

  describe('Given a schema with coincidental .shape but no .parse on field', () => {
    describe('When calling validateField', () => {
      it('Then falls back to full validation (duck-type guard rejects)', () => {
        const schema = {
          shape: { title: 'not-a-schema' },
          parse(_data: unknown) {
            const err = new Error('Validation failed');
            (err as Error & { fieldErrors: Record<string, string> }).fieldErrors = {
              title: 'Bad title',
            };
            return { ok: false, error: err };
          },
        } as unknown as FormSchema<{ title: string }>;

        const result = validateField(schema, 'title', '', { title: '' });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Bad title');
      });
    });
  });
});
