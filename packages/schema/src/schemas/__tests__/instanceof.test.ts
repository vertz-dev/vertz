import { describe, expect, it } from 'bun:test';
import { InstanceOfSchema } from '../instanceof';

describe('InstanceOfSchema', () => {
  it('accepts instances of the specified class', () => {
    const schema = new InstanceOfSchema(Date);
    const date = new Date();
    expect(schema.parse(date)).toBe(date);
  });

  it('rejects non-instances', () => {
    const schema = new InstanceOfSchema(Date);
    expect(schema.safeParse('2024-01-01').success).toBe(false);
    expect(schema.safeParse(42).success).toBe(false);
  });

  it('works with subclasses', () => {
    class Animal {}
    class Dog extends Animal {}
    const schema = new InstanceOfSchema(Animal);
    expect(schema.parse(new Dog())).toBeInstanceOf(Animal);
  });
});
