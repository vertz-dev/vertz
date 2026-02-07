import { describe, it, expect } from 'vitest';
import { Ipv6Schema } from '../ipv6';

describe('Ipv6Schema', () => {
  it('accepts valid IPv6 addresses', () => {
    const schema = new Ipv6Schema();
    expect(schema.parse('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(
      '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
    );
    expect(schema.parse('::1')).toBe('::1');
    expect(schema.parse('fe80::1')).toBe('fe80::1');
  });

  it('rejects invalid IPv6 addresses', () => {
    const schema = new Ipv6Schema();
    expect(schema.safeParse('not-ipv6').success).toBe(false);
    expect(schema.safeParse('12345::1').success).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new Ipv6Schema().toJSONSchema()).toEqual({ type: 'string', format: 'ipv6' });
  });
});
