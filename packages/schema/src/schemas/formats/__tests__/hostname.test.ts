import { describe, it, expect } from 'vitest';
import { HostnameSchema } from '../hostname';

describe('HostnameSchema', () => {
  it('accepts valid hostnames', () => {
    const schema = new HostnameSchema();
    expect(schema.parse('example.com')).toBe('example.com');
    expect(schema.parse('sub.domain.co.uk')).toBe('sub.domain.co.uk');
    expect(schema.parse('localhost')).toBe('localhost');
  });

  it('rejects invalid hostnames', () => {
    const schema = new HostnameSchema();
    expect(schema.safeParse('-invalid.com').success).toBe(false);
    expect(schema.safeParse('').success).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new HostnameSchema().toJSONSchema()).toEqual({ type: 'string', format: 'hostname' });
  });
});
