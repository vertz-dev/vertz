import { describe, expect, it } from 'bun:test';
import { SchemaType } from '../../core/types';
import { InstanceOfSchema } from '../instanceof';

describe('InstanceOfSchema', () => {
  it('accepts instances of the specified class', () => {
    const schema = new InstanceOfSchema(Date);
    const date = new Date();
    expect(schema.parse(date).data).toBe(date);
  });

  it('rejects non-instances', () => {
    const schema = new InstanceOfSchema(Date);
    expect(schema.safeParse('2024-01-01').ok).toBe(false);
    expect(schema.safeParse(42).ok).toBe(false);
  });

  it('works with subclasses', () => {
    class Animal {}
    class Dog extends Animal {}
    const schema = new InstanceOfSchema(Animal);
    expect(schema.parse(new Dog()).data).toBeInstanceOf(Animal);
  });

  it('metadata.type returns SchemaType.InstanceOf', () => {
    expect(new InstanceOfSchema(Date).metadata.type).toBe(SchemaType.InstanceOf);
  });

  it('toJSONSchema() returns empty object', () => {
    expect(new InstanceOfSchema(Date).toJSONSchema()).toEqual({});
  });

  it('_clone() preserves metadata and class reference', () => {
    const schema = new InstanceOfSchema(Date).describe('date instance');
    expect(schema.metadata.description).toBe('date instance');
    expect(schema.parse(new Date()).data).toBeInstanceOf(Date);
  });
});
