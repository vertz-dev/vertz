import { describe, expectTypeOf, it } from 'vitest';
import { s } from '../../../index';

describe('format schemas return correct types from string methods', () => {
  it('s.email().trim() returns EmailSchema', () => {
    const schema = s.email().trim();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().toLowerCase() returns EmailSchema', () => {
    const schema = s.email().toLowerCase();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().trim().toLowerCase() returns EmailSchema', () => {
    const schema = s.email().trim().toLowerCase();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().min(5) returns EmailSchema', () => {
    const schema = s.email().min(5);
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().max(100) returns EmailSchema', () => {
    const schema = s.email().max(100);
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().length(14) returns EmailSchema', () => {
    const schema = s.email().length(14);
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().regex(/test/) returns EmailSchema', () => {
    const schema = s.email().regex(/test/);
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().startsWith("admin") returns EmailSchema', () => {
    const schema = s.email().startsWith('admin');
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().endsWith(".com") returns EmailSchema', () => {
    const schema = s.email().endsWith('.com');
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().includes("@") returns EmailSchema', () => {
    const schema = s.email().includes('@');
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().uppercase() returns EmailSchema', () => {
    const schema = s.email().uppercase();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().lowercase() returns EmailSchema', () => {
    const schema = s.email().lowercase();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().toUpperCase() returns EmailSchema', () => {
    const schema = s.email().toUpperCase();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.email().normalize() returns EmailSchema', () => {
    const schema = s.email().normalize();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.uuid().trim() returns UuidSchema', () => {
    const schema = s.uuid().trim();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.uuid().toLowerCase() returns UuidSchema', () => {
    const schema = s.uuid().toLowerCase();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.url().trim() returns UrlSchema', () => {
    const schema = s.url().trim();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.hostname().toLowerCase() returns HostnameSchema', () => {
    const schema = s.hostname().toLowerCase();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.ipv4().trim() returns Ipv4Schema', () => {
    const schema = s.ipv4().trim();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.ipv6().trim() returns Ipv6Schema', () => {
    const schema = s.ipv6().trim();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.base64().trim() returns Base64Schema', () => {
    const schema = s.base64().trim();
    expectTypeOf(schema).toEqualTypeOf();
  });
  it('s.hex().trim() returns HexSchema', () => {
    const schema = s.hex().trim();
    expectTypeOf(schema).toEqualTypeOf();
  });
});
describe('type inference preserved on chained format schemas', () => {
  it('Infer<typeof s.email().trim()> is string', () => {
    const _schema = s.email().trim();
    expectTypeOf().toEqualTypeOf();
  });
  it('Infer<typeof s.email().trim().toLowerCase()> is string', () => {
    const _schema = s.email().trim().toLowerCase();
    expectTypeOf().toEqualTypeOf();
  });
  it('Infer<typeof s.uuid().toLowerCase()> is string', () => {
    const _schema = s.uuid().toLowerCase();
    expectTypeOf().toEqualTypeOf();
  });
});
//# sourceMappingURL=format-string-methods.test-d.js.map
