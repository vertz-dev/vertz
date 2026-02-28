import { describe, expect, it } from 'bun:test';
import { Ipv4Schema } from '../ipv4';

describe('Ipv4Schema', () => {
  it('accepts valid IPv4 addresses', () => {
    const schema = new Ipv4Schema();
    expect(schema.parse('0.0.0.0').data).toBe('0.0.0.0');
    expect(schema.parse('255.255.255.255').data).toBe('255.255.255.255');
    expect(schema.parse('192.168.1.1').data).toBe('192.168.1.1');
  });

  it('rejects invalid IPv4 addresses', () => {
    const schema = new Ipv4Schema();
    expect(schema.safeParse('256.0.0.0').ok).toBe(false);
    expect(schema.safeParse('1.2.3').ok).toBe(false);
    expect(schema.safeParse('not-an-ip').ok).toBe(false);
  });

  it('rejects octets with leading zeros', () => {
    const schema = new Ipv4Schema();
    expect(schema.safeParse('192.168.001.001').ok).toBe(false);
    expect(schema.safeParse('01.02.03.04').ok).toBe(false);
  });

  it('toJSONSchema includes format', () => {
    expect(new Ipv4Schema().toJSONSchema()).toEqual({ type: 'string', format: 'ipv4' });
  });
});
