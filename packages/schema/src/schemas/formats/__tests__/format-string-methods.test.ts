import { describe, expect, it } from 'vitest';
import { s } from '../../../index';
import type { Infer } from '../../../utils/type-inference';
import { Base64Schema } from '../base64';
import { CuidSchema } from '../cuid';
import { EmailSchema } from '../email';
import { HexSchema } from '../hex';
import { HostnameSchema } from '../hostname';
import { Ipv4Schema } from '../ipv4';
import { Ipv6Schema } from '../ipv6';
import { JwtSchema } from '../jwt';
import { NanoidSchema } from '../nanoid';
import { UlidSchema } from '../ulid';
import { UrlSchema } from '../url';
import { UuidSchema } from '../uuid';

describe('format schemas inherit string methods', () => {
  describe('EmailSchema', () => {
    it('supports .trim() and still validates email', () => {
      const schema = s.email().trim();
      expect(schema.parse('  user@domain.com  ')).toBe('user@domain.com');
    });

    it('supports .toLowerCase() and still validates email', () => {
      const schema = s.email().toLowerCase();
      expect(schema.parse('USER@DOMAIN.COM')).toBe('user@domain.com');
    });

    it('supports chaining .trim().toLowerCase()', () => {
      const schema = s.email().trim().toLowerCase();
      expect(schema.parse('  USER@DOMAIN.COM  ')).toBe('user@domain.com');
    });

    it('supports .min()', () => {
      const schema = s.email().min(15);
      expect(schema.safeParse('a@b.co').success).toBe(false);
      expect(schema.parse('user@longdomain.com')).toBe('user@longdomain.com');
    });

    it('supports .max()', () => {
      const schema = s.email().max(10);
      expect(schema.safeParse('verylongemail@domain.com').success).toBe(false);
      expect(schema.parse('a@b.co')).toBe('a@b.co');
    });

    it('supports .length()', () => {
      const schema = s.email().length(14);
      expect(schema.safeParse('a@b.co').success).toBe(false);
      expect(schema.parse('user@domain.co')).toBe('user@domain.co');
    });

    it('supports .regex()', () => {
      const schema = s.email().regex(/^[a-z]+@/);
      expect(schema.safeParse('ABC@domain.com').success).toBe(false);
      expect(schema.parse('abc@domain.com')).toBe('abc@domain.com');
    });

    it('supports .startsWith()', () => {
      const schema = s.email().startsWith('admin');
      expect(schema.safeParse('user@domain.com').success).toBe(false);
      expect(schema.parse('admin@domain.com')).toBe('admin@domain.com');
    });

    it('supports .endsWith()', () => {
      const schema = s.email().endsWith('.com');
      expect(schema.safeParse('user@domain.org').success).toBe(false);
      expect(schema.parse('user@domain.com')).toBe('user@domain.com');
    });

    it('still rejects invalid emails after chaining', () => {
      const schema = s.email().trim().toLowerCase();
      expect(schema.safeParse('  not-an-email  ').success).toBe(false);
    });

    it('preserves format validation in the right order (trim then validate)', () => {
      // This should trim first, then validate. " user@domain.com " trimmed = "user@domain.com" which is valid
      const schema = s.email().trim();
      expect(schema.parse(' user@domain.com ')).toBe('user@domain.com');
    });
  });

  describe('UuidSchema', () => {
    it('supports .toLowerCase()', () => {
      const schema = s.uuid().toLowerCase();
      expect(schema.parse('F47AC10B-58CC-4372-A567-0E02B2C3D479')).toBe(
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      );
    });

    it('supports .trim()', () => {
      const schema = s.uuid().trim();
      expect(schema.parse('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(
        '550e8400-e29b-41d4-a716-446655440000',
      );
    });

    it('still rejects invalid UUIDs after chaining', () => {
      const schema = s.uuid().trim().toLowerCase();
      expect(schema.safeParse('  not-a-uuid  ').success).toBe(false);
    });
  });

  describe('UrlSchema', () => {
    it('supports .trim()', () => {
      const schema = s.url().trim();
      expect(schema.parse('  https://example.com  ')).toBe('https://example.com');
    });

    it('still rejects invalid URLs after chaining', () => {
      const schema = s.url().trim();
      expect(schema.safeParse('  not-a-url  ').success).toBe(false);
    });
  });

  describe('HostnameSchema', () => {
    it('supports .trim()', () => {
      const schema = s.hostname().trim();
      expect(schema.parse('  example.com  ')).toBe('example.com');
    });

    it('supports .toLowerCase()', () => {
      const schema = s.hostname().toLowerCase();
      expect(schema.parse('EXAMPLE.COM')).toBe('example.com');
    });
  });

  describe('all format schemas return correct type from factory', () => {
    it('s.email() methods return EmailSchema', () => {
      const schema = s.email().trim();
      expect(schema).toBeInstanceOf(EmailSchema);
    });

    it('s.uuid() methods return UuidSchema', () => {
      const schema = s.uuid().trim();
      expect(schema).toBeInstanceOf(UuidSchema);
    });

    it('s.url() methods return UrlSchema', () => {
      const schema = s.url().trim();
      expect(schema).toBeInstanceOf(UrlSchema);
    });

    it('s.hostname() methods return HostnameSchema', () => {
      const schema = s.hostname().trim();
      expect(schema).toBeInstanceOf(HostnameSchema);
    });

    it('s.ipv4() methods return Ipv4Schema', () => {
      const schema = s.ipv4().trim();
      expect(schema).toBeInstanceOf(Ipv4Schema);
    });

    it('s.ipv6() methods return Ipv6Schema', () => {
      const schema = s.ipv6().trim();
      expect(schema).toBeInstanceOf(Ipv6Schema);
    });

    it('s.base64() methods return Base64Schema', () => {
      const schema = s.base64().trim();
      expect(schema).toBeInstanceOf(Base64Schema);
    });

    it('s.hex() methods return HexSchema', () => {
      const schema = s.hex().trim();
      expect(schema).toBeInstanceOf(HexSchema);
    });

    it('s.jwt() methods return JwtSchema', () => {
      const schema = s.jwt().trim();
      expect(schema).toBeInstanceOf(JwtSchema);
    });

    it('s.cuid() methods return CuidSchema', () => {
      const schema = s.cuid().trim();
      expect(schema).toBeInstanceOf(CuidSchema);
    });

    it('s.ulid() methods return UlidSchema', () => {
      const schema = s.ulid().trim();
      expect(schema).toBeInstanceOf(UlidSchema);
    });

    it('s.nanoid() methods return NanoidSchema', () => {
      const schema = s.nanoid().trim();
      expect(schema).toBeInstanceOf(NanoidSchema);
    });
  });

  describe('chained format schemas produce valid JSON schema', () => {
    it('email with trim still includes format in JSON schema', () => {
      const schema = s.email().trim();
      const json = schema.toJSONSchema();
      expect(json).toEqual({ type: 'string', format: 'email' });
    });

    it('uuid with min still includes format in JSON schema', () => {
      const schema = s.uuid().min(36);
      const json = schema.toJSONSchema();
      expect(json).toEqual({ type: 'string', format: 'uuid', minLength: 36 });
    });
  });

  describe('type inference is preserved', () => {
    it('Infer<typeof emailSchema> is string', () => {
      const emailSchema = s.email();
      type EmailType = Infer<typeof emailSchema>;
      const val: EmailType = 'test@example.com';
      // This is a runtime assertion that the type resolves to string
      const str: string = val;
      expect(str).toBe('test@example.com');
    });

    it('Infer on chained format schema is still string', () => {
      const emailSchema = s.email().trim().toLowerCase();
      type EmailType = Infer<typeof emailSchema>;
      const val: EmailType = 'test@example.com';
      const str: string = val;
      expect(str).toBe('test@example.com');
    });
  });
});
