import { describe, expect, it } from 'vitest';
import { EmailSchema } from '../email';

describe('EmailSchema', () => {
  it('accepts valid emails', () => {
    const schema = new EmailSchema();
    expect(schema.parse('user@domain.com')).toBe('user@domain.com');
    expect(schema.parse('user+tag@sub.domain.co')).toBe('user+tag@sub.domain.co');
  });

  it('rejects invalid emails', () => {
    const schema = new EmailSchema();
    expect(schema.safeParse('no-at-sign').success).toBe(false);
    expect(schema.safeParse('double@@domain.com').success).toBe(false);
    expect(schema.safeParse('@domain.com').success).toBe(false);
  });

  it('inherits StringSchema methods', () => {
    const schema = new EmailSchema().min(10);
    expect(schema.safeParse('a@b.co').success).toBe(false);
    expect(schema.parse('user@domain.com')).toBe('user@domain.com');
  });

  it('toJSONSchema includes format', () => {
    expect(new EmailSchema().toJSONSchema()).toEqual({ type: 'string', format: 'email' });
  });

  it('does not hang on adversarial input (ReDoS)', () => {
    const schema = new EmailSchema();
    const start = Date.now();
    schema.safeParse(`a@${'a-'.repeat(50)}.com`);
    schema.safeParse(`a@${'a.'.repeat(50)}x`);
    expect(Date.now() - start).toBeLessThan(100);
  });
});
