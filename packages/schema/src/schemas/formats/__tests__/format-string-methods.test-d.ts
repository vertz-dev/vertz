import { describe, it } from 'bun:test';
import type { Equal, Expect } from '../../../__tests__/_type-helpers';
import { s } from '../../../index';
import type { Infer } from '../../../utils/type-inference';
import type { Base64Schema } from '../base64';
import type { EmailSchema } from '../email';
import type { HexSchema } from '../hex';
import type { HostnameSchema } from '../hostname';
import type { Ipv4Schema } from '../ipv4';
import type { Ipv6Schema } from '../ipv6';
import type { UrlSchema } from '../url';
import type { UuidSchema } from '../uuid';

describe('format schemas return correct types from string methods', () => {
  it('s.email().trim() returns EmailSchema', () => {
    const schema = s.email().trim();
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().toLowerCase() returns EmailSchema', () => {
    const schema = s.email().toLowerCase();
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().trim().toLowerCase() returns EmailSchema', () => {
    const schema = s.email().trim().toLowerCase();
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().min(5) returns EmailSchema', () => {
    const schema = s.email().min(5);
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().max(100) returns EmailSchema', () => {
    const schema = s.email().max(100);
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().length(14) returns EmailSchema', () => {
    const schema = s.email().length(14);
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().regex(/test/) returns EmailSchema', () => {
    const schema = s.email().regex(/test/);
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().startsWith("admin") returns EmailSchema', () => {
    const schema = s.email().startsWith('admin');
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().endsWith(".com") returns EmailSchema', () => {
    const schema = s.email().endsWith('.com');
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().includes("@") returns EmailSchema', () => {
    const schema = s.email().includes('@');
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().uppercase() returns EmailSchema', () => {
    const schema = s.email().uppercase();
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().lowercase() returns EmailSchema', () => {
    const schema = s.email().lowercase();
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().toUpperCase() returns EmailSchema', () => {
    const schema = s.email().toUpperCase();
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.email().normalize() returns EmailSchema', () => {
    const schema = s.email().normalize();
    type _t1 = Expect<Equal<typeof schema, EmailSchema>>;
  });

  it('s.uuid().trim() returns UuidSchema', () => {
    const schema = s.uuid().trim();
    type _t1 = Expect<Equal<typeof schema, UuidSchema>>;
  });

  it('s.uuid().toLowerCase() returns UuidSchema', () => {
    const schema = s.uuid().toLowerCase();
    type _t1 = Expect<Equal<typeof schema, UuidSchema>>;
  });

  it('s.url().trim() returns UrlSchema', () => {
    const schema = s.url().trim();
    type _t1 = Expect<Equal<typeof schema, UrlSchema>>;
  });

  it('s.hostname().toLowerCase() returns HostnameSchema', () => {
    const schema = s.hostname().toLowerCase();
    type _t1 = Expect<Equal<typeof schema, HostnameSchema>>;
  });

  it('s.ipv4().trim() returns Ipv4Schema', () => {
    const schema = s.ipv4().trim();
    type _t1 = Expect<Equal<typeof schema, Ipv4Schema>>;
  });

  it('s.ipv6().trim() returns Ipv6Schema', () => {
    const schema = s.ipv6().trim();
    type _t1 = Expect<Equal<typeof schema, Ipv6Schema>>;
  });

  it('s.base64().trim() returns Base64Schema', () => {
    const schema = s.base64().trim();
    type _t1 = Expect<Equal<typeof schema, Base64Schema>>;
  });

  it('s.hex().trim() returns HexSchema', () => {
    const schema = s.hex().trim();
    type _t1 = Expect<Equal<typeof schema, HexSchema>>;
  });
});

describe('type inference preserved on chained format schemas', () => {
  it('Infer<typeof s.email().trim()> is string', () => {
    const schema = s.email().trim();
    type _t1 = Expect<Equal<Infer<typeof schema>, string>>;
  });

  it('Infer<typeof s.email().trim().toLowerCase()> is string', () => {
    const schema = s.email().trim().toLowerCase();
    type _t1 = Expect<Equal<Infer<typeof schema>, string>>;
  });

  it('Infer<typeof s.uuid().toLowerCase()> is string', () => {
    const schema = s.uuid().toLowerCase();
    type _t1 = Expect<Equal<Infer<typeof schema>, string>>;
  });
});
