import { describe, expect, it } from '@vertz/test';
import { NumberSchema } from '../../schemas/number';
import { StringSchema } from '../../schemas/string';
import { DefaultSchema, NullableSchema, OptionalSchema } from '../schema';
import { SchemaType } from '../types';

describe('OptionalSchema', () => {
  it('accepts undefined and returns undefined', () => {
    const inner = new StringSchema();
    const schema = new OptionalSchema(inner);
    expect(schema.parse(undefined).data).toBeUndefined();
  });

  it('passes through to inner schema for non-undefined values', () => {
    const inner = new StringSchema();
    const schema = new OptionalSchema(inner);
    expect(schema.parse('hello').data).toBe('hello');
    expect(schema.parse(42).ok).toBe(false);
  });

  it('unwrap() returns the inner schema', () => {
    const inner = new StringSchema();
    const schema = new OptionalSchema(inner);
    expect(schema.unwrap()).toBe(inner);
  });

  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().optional();
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('_clone() preserves metadata', () => {
    const schema = new StringSchema().optional().describe('opt field');
    expect(schema.metadata.description).toBe('opt field');
    expect(schema.parse(undefined).data).toBeUndefined();
  });

  it('toJSONSchema() delegates to inner schema', () => {
    const schema = new StringSchema().optional();
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });
});

describe('NullableSchema', () => {
  it('accepts null and returns null', () => {
    const inner = new StringSchema();
    const schema = new NullableSchema(inner);
    expect(schema.parse(null).data).toBeNull();
  });

  it('passes through to inner schema for non-null values', () => {
    const inner = new StringSchema();
    const schema = new NullableSchema(inner);
    expect(schema.parse('hello').data).toBe('hello');
    expect(schema.parse(42).ok).toBe(false);
  });

  it('toJSONSchema() produces type: ["string", "null"] for string inner', () => {
    const inner = new StringSchema();
    const schema = new NullableSchema(inner);
    expect(schema.toJSONSchema()).toEqual({ type: ['string', 'null'] });
  });

  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().nullable();
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('_clone() preserves metadata', () => {
    const schema = new StringSchema().nullable().describe('nullable field');
    expect(schema.metadata.description).toBe('nullable field');
    expect(schema.parse(null).data).toBeNull();
  });

  it('unwrap() returns the inner schema', () => {
    const inner = new StringSchema();
    const schema = new NullableSchema(inner);
    expect(schema.unwrap()).toBe(inner);
  });

  it('toJSONSchema() uses anyOf when inner type is not a simple string type', () => {
    const inner = new StringSchema().nullable();
    // NullableSchema wrapping NullableSchema — inner type is array, not string
    const schema = new NullableSchema(inner);
    const json = schema.toJSONSchema();
    expect(json.anyOf).toBeDefined();
  });
});

describe('DefaultSchema', () => {
  it('uses default value when input is undefined', () => {
    const inner = new StringSchema();
    const schema = new DefaultSchema(inner, 'fallback');
    expect(schema.parse(undefined).data).toBe('fallback');
  });

  it('passes through for non-undefined values', () => {
    const inner = new StringSchema();
    const schema = new DefaultSchema(inner, 'fallback');
    expect(schema.parse('hello').data).toBe('hello');
    expect(schema.parse(42).ok).toBe(false);
  });

  it('calls function default each time when input is undefined', () => {
    let counter = 0;
    const inner = new StringSchema();
    const schema = new DefaultSchema(inner, () => `value-${++counter}`);
    expect(schema.parse(undefined).data).toBe('value-1');
    expect(schema.parse(undefined).data).toBe('value-2');
    expect(schema.parse(undefined).data).toBe('value-3');
  });

  it('toJSONSchema() includes default property', () => {
    const inner = new StringSchema();
    const schema = new DefaultSchema(inner, 'fallback');
    expect(schema.toJSONSchema()).toEqual({ type: 'string', default: 'fallback' });
  });

  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().default('hi');
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('_clone() preserves metadata', () => {
    const schema = new StringSchema().default('hi').describe('with default');
    expect(schema.metadata.description).toBe('with default');
    expect(schema.parse(undefined).data).toBe('hi');
  });
});

describe('RefinedSchema', () => {
  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().refine((v) => v.length > 0);
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('toJSONSchema() delegates to inner schema', () => {
    const schema = new StringSchema().refine((v) => v.length > 0);
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });

  it('_clone() preserves metadata and refinement', () => {
    const schema = new StringSchema()
      .refine((v) => v.length > 0, 'must be non-empty')
      .describe('refined');
    expect(schema.metadata.description).toBe('refined');
    expect(schema.parse('').ok).toBe(false);
    expect(schema.parse('hello').data).toBe('hello');
  });
});

describe('SuperRefinedSchema', () => {
  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().superRefine(() => {});
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('toJSONSchema() delegates to inner schema', () => {
    const schema = new StringSchema().superRefine(() => {});
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });

  it('_clone() preserves metadata and refinement', () => {
    const schema = new StringSchema()
      .superRefine((val, ctx) => {
        if (val.length === 0) ctx.addIssue({ code: 'custom', message: 'empty' });
      })
      .describe('super-refined');
    expect(schema.metadata.description).toBe('super-refined');
    expect(schema.parse('').ok).toBe(false);
  });
});

describe('TransformSchema', () => {
  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().transform((v) => v.length);
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('toJSONSchema() delegates to inner schema', () => {
    const schema = new StringSchema().transform((v) => v.length);
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });

  it('_clone() preserves metadata and transform', () => {
    const schema = new StringSchema().transform((v) => v.length).describe('length transform');
    expect(schema.metadata.description).toBe('length transform');
    expect(schema.parse('hello').data).toBe(5);
  });
});

describe('PipeSchema', () => {
  it('_schemaType() returns second schema type', () => {
    const schema = new StringSchema().pipe(new NumberSchema());
    expect(schema.metadata.type).toBe(SchemaType.Number);
  });

  it('toJSONSchema() delegates to first schema', () => {
    const schema = new StringSchema().pipe(new NumberSchema());
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });

  it('_clone() preserves metadata', () => {
    const schema = new StringSchema()
      .transform((v) => Number(v))
      .pipe(new NumberSchema())
      .describe('piped');
    expect(schema.metadata.description).toBe('piped');
  });
});

describe('CatchSchema', () => {
  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().catch('fallback');
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('toJSONSchema() delegates to inner schema', () => {
    const schema = new StringSchema().catch('fallback');
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });

  it('_clone() preserves metadata and fallback', () => {
    const schema = new StringSchema().catch('fallback').describe('with catch');
    expect(schema.metadata.description).toBe('with catch');
    // Invalid input returns fallback
    expect(schema.parse(42).data).toBe('fallback');
  });
});

describe('BrandedSchema', () => {
  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().brand<'Email'>();
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('toJSONSchema() delegates to inner schema', () => {
    const schema = new StringSchema().brand<'Email'>();
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });

  it('_clone() preserves metadata', () => {
    const schema = new StringSchema().brand<'Email'>().describe('branded');
    expect(schema.metadata.description).toBe('branded');
    expect(schema.parse('test').data).toBe('test');
  });
});

describe('ReadonlySchema', () => {
  it('_schemaType() delegates to inner schema', () => {
    const schema = new StringSchema().readonly();
    expect(schema.metadata.type).toBe(SchemaType.String);
  });

  it('toJSONSchema() delegates to inner schema', () => {
    const schema = new StringSchema().readonly();
    expect(schema.toJSONSchema()).toEqual({ type: 'string' });
  });

  it('_clone() preserves metadata', () => {
    const schema = new StringSchema().readonly().describe('readonly');
    expect(schema.metadata.description).toBe('readonly');
  });
});

describe('Wrapper chaining', () => {
  it('s.string().optional().nullable() stacks wrappers correctly', () => {
    const schema = new StringSchema().optional().nullable();
    expect(schema.parse(null).data).toBeNull();
    expect(schema.parse(undefined).data).toBeUndefined();
    expect(schema.parse('hello').data).toBe('hello');
  });

  it('inner refinements still execute through wrapper', () => {
    const inner = new StringSchema().min(3);
    const schema = inner.optional();
    // undefined should pass through without inner validation
    expect(schema.parse(undefined).data).toBeUndefined();
    // valid string passes inner refinements
    expect(schema.parse('hello').data).toBe('hello');
    // short string fails inner min(3) refinement
    expect(schema.parse('hi').ok).toBe(false);
  });
});
