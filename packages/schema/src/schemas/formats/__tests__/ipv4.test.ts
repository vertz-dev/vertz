import { describe, expect, it } from 'bun:test';
import { Ipv4Schema } from '../ipv4';

describe('Ipv4Schema', () => {
  it('accepts valid IPv4 addresses', () => {
    const schema = new Ipv4Schema();
    expect(schema.parse('0.0.0.0')).toBe('0.0.0.0');
    expect(schema.parse('255.255.255.255')).toBe('255.255.255.255');
    expect(schema.parse('192.168.1.1')).toBe('192.168.1.1');
  });

  it('rejects invalid IPv4 addresses', () => {
    const schema = new Ipv4Schema();
    expect(schema.safeParse('256.0.0.0').success).toBe(false);
    expect(schema.safeParse('1.2.3').success).toBe(false);
    expect(schema.safeParse('not-an-ip').success).toBe(false);
  });

  it('rejects octets with leading zeros', () => {
    const schema = new Ipv4Schema();
    expect(schema.safeParse('192.168.001.001').success).toBe(false);
    expect(schema.safeParse('01.02.03.04').success).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new Ipv4Schema().toJSONSchema()).toEqual({ type: 'string', format: 'ipv4' });
  });
});
