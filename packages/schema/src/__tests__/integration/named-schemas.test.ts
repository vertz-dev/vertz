import { describe, it, expect } from 'vitest';
import { s, SchemaRegistry } from '../..';

describe('Integration: Named Schemas', () => {
  it('named primitive with $ref + $defs', () => {
    const userId = s.uuid().id('UserId');
    const jsonSchema = userId.toJSONSchema();
    expect(jsonSchema.$ref).toBe('#/$defs/UserId');
    expect(jsonSchema.$defs!['UserId']).toBeDefined();
    expect(jsonSchema.$defs!['UserId'].format).toBe('uuid');
  });

  it('named object with named nested schemas', () => {
    const addressSchema = s.object({
      street: s.string(),
      city: s.string(),
    }).id('Address');

    const userSchema = s.object({
      name: s.string(),
      address: addressSchema,
    }).id('UserWithAddress');

    const jsonSchema = userSchema.toJSONSchema();
    expect(jsonSchema.$defs!['UserWithAddress']).toBeDefined();
    expect(jsonSchema.$defs!['Address']).toBeDefined();
  });

  it('JSON Schema output with $defs and $ref', () => {
    const emailType = s.email().id('Email');
    const contactSchema = s.object({
      primary: emailType,
      secondary: emailType,
    });
    const jsonSchema = contactSchema.toJSONSchema();
    expect(jsonSchema.$defs!['Email']).toBeDefined();
    // Both properties should reference the same $ref
    const props = jsonSchema.properties as Record<string, any>;
    expect(props.primary.$ref).toBe('#/$defs/Email');
    expect(props.secondary.$ref).toBe('#/$defs/Email');
  });

  it('SchemaRegistry contains named schemas', () => {
    const testSchema = s.string().id('TestRegistrySchema');
    expect(SchemaRegistry.get('TestRegistrySchema')).toBeDefined();
  });
});
