import { describe, expect, it } from '@vertz/test';
import { s } from '@vertz/schema';
import { coerceFormDataToSchema, coerceLeaf, isVertzSchema } from '../coerce';

describe('Feature: coerceLeaf — Boolean inner schema', () => {
  describe('Given the value is undefined', () => {
    it('then returns false', () => {
      expect(coerceLeaf(undefined, s.boolean())).toBe(false);
    });
  });
  describe('Given the value is "" (empty string)', () => {
    it('then returns false', () => {
      expect(coerceLeaf('', s.boolean())).toBe(false);
    });
  });
  describe('Given the value is "false"', () => {
    it('then returns false', () => {
      expect(coerceLeaf('false', s.boolean())).toBe(false);
    });
  });
  describe('Given the value is "off"', () => {
    it('then returns false', () => {
      expect(coerceLeaf('off', s.boolean())).toBe(false);
    });
  });
  describe('Given the value is "0"', () => {
    it('then returns false', () => {
      expect(coerceLeaf('0', s.boolean())).toBe(false);
    });
  });
  describe('Given the value is the boolean false', () => {
    it('then returns false', () => {
      expect(coerceLeaf(false, s.boolean())).toBe(false);
    });
  });
  describe('Given the value is "on"', () => {
    it('then returns true', () => {
      expect(coerceLeaf('on', s.boolean())).toBe(true);
    });
  });
  describe('Given the value is "true"', () => {
    it('then returns true', () => {
      expect(coerceLeaf('true', s.boolean())).toBe(true);
    });
  });
  describe('Given the value is "1"', () => {
    it('then returns true', () => {
      expect(coerceLeaf('1', s.boolean())).toBe(true);
    });
  });
  describe('Given the value is the boolean true', () => {
    it('then returns true', () => {
      expect(coerceLeaf(true, s.boolean())).toBe(true);
    });
  });
  describe('Given the value is another non-empty string ("yes")', () => {
    it('then returns true (Boolean(string) semantics)', () => {
      expect(coerceLeaf('yes', s.boolean())).toBe(true);
    });
  });
});

describe('Feature: coerceLeaf — Number inner schema', () => {
  describe('Given the value is undefined', () => {
    it('then returns undefined (caller drops key)', () => {
      expect(coerceLeaf(undefined, s.number())).toBeUndefined();
    });
  });
  describe('Given the value is "" (empty string)', () => {
    it('then returns undefined', () => {
      expect(coerceLeaf('', s.number())).toBeUndefined();
    });
  });
  describe('Given the value is the numeric string "42"', () => {
    it('then returns the number 42', () => {
      expect(coerceLeaf('42', s.number())).toBe(42);
    });
  });
  describe('Given the value is "0"', () => {
    it('then returns the number 0', () => {
      expect(coerceLeaf('0', s.number())).toBe(0);
    });
  });
  describe('Given the value is "-1.5"', () => {
    it('then returns -1.5', () => {
      expect(coerceLeaf('-1.5', s.number())).toBe(-1.5);
    });
  });
  describe('Given the value is a non-numeric non-empty string ("42a")', () => {
    it('then passes the string through unchanged', () => {
      expect(coerceLeaf('42a', s.number())).toBe('42a');
    });
  });
});

describe('Feature: coerceLeaf — BigInt inner schema', () => {
  describe('Given the value is undefined', () => {
    it('then returns undefined', () => {
      expect(coerceLeaf(undefined, s.bigint())).toBeUndefined();
    });
  });
  describe('Given the value is "" (empty string)', () => {
    it('then returns undefined', () => {
      expect(coerceLeaf('', s.bigint())).toBeUndefined();
    });
  });
  describe('Given the value is the numeric string "42"', () => {
    it('then returns BigInt(42)', () => {
      expect(coerceLeaf('42', s.bigint())).toBe(42n);
    });
  });
  describe('Given the value cannot be parsed as a BigInt', () => {
    it('then passes the value through unchanged', () => {
      expect(coerceLeaf('not-a-bigint', s.bigint())).toBe('not-a-bigint');
    });
  });
});

describe('Feature: coerceLeaf — Date inner schema', () => {
  describe('Given the value is undefined', () => {
    it('then returns undefined', () => {
      expect(coerceLeaf(undefined, s.date())).toBeUndefined();
    });
  });
  describe('Given the value is "" (empty string)', () => {
    it('then returns undefined', () => {
      expect(coerceLeaf('', s.date())).toBeUndefined();
    });
  });
  describe('Given the value is a parseable ISO string', () => {
    it('then returns a Date instance for that timestamp', () => {
      const result = coerceLeaf('2026-04-18T12:00:00Z', s.date());
      expect(result).toBeInstanceOf(Date);
      expect((result as Date).toISOString()).toBe('2026-04-18T12:00:00.000Z');
    });
  });
  describe('Given the value is an unparseable string', () => {
    it('then passes the string through unchanged', () => {
      expect(coerceLeaf('not-a-date', s.date())).toBe('not-a-date');
    });
  });
});

describe('Feature: coerceLeaf — pass-through schema types', () => {
  describe('Given a String inner schema and a numeric-looking value', () => {
    it('then never coerces the value', () => {
      expect(coerceLeaf('42', s.string())).toBe('42');
    });
  });
  describe('Given an Enum inner schema', () => {
    it('then passes the value through unchanged', () => {
      expect(coerceLeaf('a', s.enum(['a', 'b']))).toBe('a');
    });
  });
  describe('Given a Literal inner schema', () => {
    it('then passes the value through unchanged', () => {
      expect(coerceLeaf('hello', s.literal('hello'))).toBe('hello');
    });
  });
  describe('Given a Lazy inner schema', () => {
    it('then passes the value through unchanged (no recursion)', () => {
      const lazy = s.lazy(() => s.boolean());
      expect(coerceLeaf('on', lazy)).toBe('on');
    });
  });
  describe('Given a non-Vertz schema (custom adapter with only .parse)', () => {
    it('then passes the value through unchanged', () => {
      const adapter = { parse: (v: unknown) => v };
      expect(coerceLeaf('42', adapter)).toBe('42');
    });
  });
});

describe('Feature: coerceLeaf — already-typed pass-through (defensive)', () => {
  describe('Given a Number schema and a number value', () => {
    it('then returns the number unchanged', () => {
      expect(coerceLeaf(42, s.number())).toBe(42);
    });
  });
  describe('Given a Number schema and a non-string non-number value', () => {
    it('then passes the value through', () => {
      const obj = { x: 1 };
      expect(coerceLeaf(obj, s.number())).toBe(obj);
    });
  });
  describe('Given a BigInt schema and a bigint value', () => {
    it('then returns the bigint unchanged', () => {
      expect(coerceLeaf(7n, s.bigint())).toBe(7n);
    });
  });
  describe('Given a BigInt schema and a number value', () => {
    it('then returns BigInt(n)', () => {
      expect(coerceLeaf(7, s.bigint())).toBe(7n);
    });
  });
  describe('Given a BigInt schema and a non-string non-number non-bigint value', () => {
    it('then passes the value through', () => {
      const obj = { x: 1 };
      expect(coerceLeaf(obj, s.bigint())).toBe(obj);
    });
  });
  describe('Given a Date schema and a Date value', () => {
    it('then returns the same Date', () => {
      const d = new Date('2026-04-18T12:00:00Z');
      expect(coerceLeaf(d, s.date())).toBe(d);
    });
  });
  describe('Given a Date schema and a non-string non-Date value', () => {
    it('then passes the value through', () => {
      const obj = { x: 1 };
      expect(coerceLeaf(obj, s.date())).toBe(obj);
    });
  });
  describe('Given a Boolean schema and null', () => {
    it('then returns false', () => {
      expect(coerceLeaf(null, s.boolean())).toBe(false);
    });
  });
  describe('Given a Boolean schema and a non-string truthy value', () => {
    it('then returns Boolean(value)', () => {
      expect(coerceLeaf(1, s.boolean())).toBe(true);
    });
  });
});

describe('Feature: coerceLeaf — wrapper unwrapping', () => {
  describe('Given a Boolean wrapped in optional()', () => {
    it('then still coerces using boolean rules', () => {
      expect(coerceLeaf('on', s.boolean().optional())).toBe(true);
    });
  });
  describe('Given a Number wrapped in default()', () => {
    it('then still coerces using number rules', () => {
      expect(coerceLeaf('42', s.number().default(0))).toBe(42);
    });
  });
  describe('Given a Boolean wrapped in nullable()', () => {
    it('then still coerces using boolean rules', () => {
      expect(coerceLeaf('false', s.boolean().nullable())).toBe(false);
    });
  });
});

describe('Feature: isVertzSchema', () => {
  describe('Given a real Vertz schema', () => {
    it('then returns true', () => {
      expect(isVertzSchema(s.boolean())).toBe(true);
    });
  });
  describe('Given a custom adapter without _schemaType', () => {
    it('then returns false', () => {
      expect(isVertzSchema({ parse: (v: unknown) => v })).toBe(false);
    });
  });
  describe('Given null', () => {
    it('then returns false', () => {
      expect(isVertzSchema(null)).toBe(false);
    });
  });
  describe('Given undefined', () => {
    it('then returns false', () => {
      expect(isVertzSchema(undefined)).toBe(false);
    });
  });
});

describe('Feature: coerceFormDataToSchema — flat object with mixed types', () => {
  describe('Given a schema with string, boolean, number fields and matching FormData', () => {
    it('then returns coerced object respecting per-field type', () => {
      const schema = s.object({
        name: s.string(),
        active: s.boolean(),
        priority: s.number(),
      });
      const fd = new FormData();
      fd.append('name', 'Buy milk');
      fd.append('active', 'on');
      fd.append('priority', '0');

      expect(coerceFormDataToSchema(fd, schema)).toEqual({
        name: 'Buy milk',
        active: true,
        priority: 0,
      });
    });
  });

  describe('Given a boolean field whose checkbox is unchecked (key absent)', () => {
    it('then sets the boolean to false', () => {
      const schema = s.object({ active: s.boolean() });
      const fd = new FormData();
      const result = coerceFormDataToSchema(fd, schema);
      expect(result).toEqual({ active: false });
    });
  });

  describe('Given a number field with empty string in FormData', () => {
    it('then drops the key from the result so optional()/default() can apply', () => {
      const schema = s.object({ priority: s.number().optional() });
      const fd = new FormData();
      fd.append('priority', '');
      const result = coerceFormDataToSchema(fd, schema);
      expect(result).toEqual({});
    });
  });
});

describe('Feature: coerceFormDataToSchema — nested object', () => {
  describe('Given a schema with nested object and dotted FormData keys', () => {
    it('then assembles the nested object with coerced leaves', () => {
      const schema = s.object({
        address: s.object({
          street: s.string(),
          number: s.number(),
        }),
      });
      const fd = new FormData();
      fd.append('address.street', 'Main St');
      fd.append('address.number', '42');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({
        address: { street: 'Main St', number: 42 },
      });
    });
  });
});

describe('Feature: coerceFormDataToSchema — primitive arrays via getAll', () => {
  describe('Given a schema with array of strings and multi-value FormData', () => {
    it('then collects all values into a string array', () => {
      const schema = s.object({ tags: s.array(s.string()) });
      const fd = new FormData();
      fd.append('tags', 'a');
      fd.append('tags', 'b');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ tags: ['a', 'b'] });
    });
  });

  describe('Given a schema with array of booleans and multi-value FormData', () => {
    it('then coerces each value using boolean rules', () => {
      const schema = s.object({ flags: s.array(s.boolean()) });
      const fd = new FormData();
      fd.append('flags', 'on');
      fd.append('flags', '');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ flags: [true, false] });
    });
  });
});

describe('Feature: coerceFormDataToSchema — array of objects fallback', () => {
  describe('Given an array of objects schema with dotted-index FormData keys', () => {
    it('then falls back to nested-index parsing without dropping data', () => {
      const schema = s.object({
        items: s.array(s.object({ name: s.string() })),
      });
      const fd = new FormData();
      fd.append('items.0.name', 'first');
      fd.append('items.1.name', 'second');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({
        items: [{ name: 'first' }, { name: 'second' }],
      });
    });
  });
});

describe('Feature: coerceFormDataToSchema — array of objects with no FormData entries', () => {
  describe('Given an array-of-objects field with no matching keys', () => {
    it('then returns an empty array (fallback default)', () => {
      const schema = s.object({ items: s.array(s.object({ name: s.string() })) });
      const fd = new FormData();
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ items: [] });
    });
  });
});

describe('Feature: coerceFormDataToSchema — wrapper schemas', () => {
  describe('Given a refined boolean field', () => {
    it('then still coerces (Refined delegates _schemaType)', () => {
      const schema = s.object({ active: s.boolean().refine((b) => b === true) });
      const fd = new FormData();
      fd.append('active', 'on');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ active: true });
    });
  });

  describe('Given an optional boolean field whose key is absent', () => {
    it('then coerces to false (Optional delegates _schemaType for leaves)', () => {
      const schema = s.object({ active: s.boolean().optional() });
      const fd = new FormData();
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ active: false });
    });
  });

  describe('Given a lazy field', () => {
    it('then passes the value through unchanged', () => {
      const schema = s.object({ tags: s.lazy(() => s.string()) });
      const fd = new FormData();
      fd.append('tags', '42');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ tags: '42' });
    });
  });

  describe('Given a top-level refined object schema', () => {
    it('then unwraps the refine and coerces inner fields', () => {
      const schema = s
        .object({ active: s.boolean(), priority: s.number() })
        .refine((d) => d.priority > 0);
      const fd = new FormData();
      fd.append('active', 'on');
      fd.append('priority', '42');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ active: true, priority: 42 });
    });
  });

  describe('Given a top-level superRefined object schema', () => {
    it('then unwraps the superRefine and coerces inner fields', () => {
      const schema = s
        .object({ active: s.boolean() })
        .superRefine((d, ctx) => {
          if (!d.active) ctx.addIssue({ code: 'custom', message: 'must be active' });
        });
      const fd = new FormData();
      fd.append('active', 'on');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ active: true });
    });
  });
});

describe('Feature: coerceFormDataToSchema — non-Vertz adapter fallback', () => {
  describe('Given a custom adapter without _schemaType', () => {
    it('then falls back to formDataToObject({ nested: true })', () => {
      const adapter = { parse: (v: unknown) => v };
      const fd = new FormData();
      fd.append('a', '1');
      fd.append('b', '2');
      expect(coerceFormDataToSchema(fd, adapter)).toEqual({ a: '1', b: '2' });
    });
  });

  describe('Given a Vertz schema that is not an Object at the top level', () => {
    it('then falls back to formDataToObject({ nested: true })', () => {
      const schema = s.string();
      const fd = new FormData();
      fd.append('a', '1');
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ a: '1' });
    });
  });
});

describe('Feature: coerceFormDataToSchema — File entries on non-File fields', () => {
  describe('Given a Boolean field whose FormData entry is a File', () => {
    it('then treats it as absent (false), not Boolean(File)=true', () => {
      const schema = s.object({ active: s.boolean() });
      const fd = new FormData();
      const file = new File(['hi'], 'hi.txt', { type: 'text/plain' });
      fd.append('active', file);
      expect(coerceFormDataToSchema(fd, schema)).toEqual({ active: false });
    });
  });

  describe('Given a Number field whose FormData entry is a File', () => {
    it('then drops the key (treated as absent)', () => {
      const schema = s.object({ priority: s.number().optional() });
      const fd = new FormData();
      const file = new File(['1'], 'one.txt', { type: 'text/plain' });
      fd.append('priority', file);
      expect(coerceFormDataToSchema(fd, schema)).toEqual({});
    });
  });
});

describe('Feature: coerceFormDataToSchema — mutation safety', () => {
  describe('Given a FormData passed through coercion', () => {
    it('then leaves the original FormData entries intact', () => {
      const schema = s.object({ active: s.boolean(), priority: s.number() });
      const fd = new FormData();
      fd.append('active', 'on');
      fd.append('priority', '5');
      coerceFormDataToSchema(fd, schema);
      expect(fd.get('active')).toBe('on');
      expect(fd.get('priority')).toBe('5');
    });
  });
});
