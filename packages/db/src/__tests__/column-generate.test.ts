import { describe, expect, it } from 'bun:test';
import { d } from '../d';

describe('Column generate metadata', () => {
  // Test 7: d.text().primary({ generate: 'cuid' })._meta.generate === 'cuid'
  it('sets generate: cuid on primary column', () => {
    const col = d.text().primary({ generate: 'cuid' });
    expect(col._meta.generate).toBe('cuid');
  });

  // Test 8: d.text().primary({ generate: 'uuid' })._meta.generate === 'uuid'
  it('sets generate: uuid on primary column', () => {
    const col = d.text().primary({ generate: 'uuid' });
    expect(col._meta.generate).toBe('uuid');
  });

  // Test 9: d.text().primary({ generate: 'nanoid' })._meta.generate === 'nanoid'
  it('sets generate: nanoid on primary column', () => {
    const col = d.text().primary({ generate: 'nanoid' });
    expect(col._meta.generate).toBe('nanoid');
  });

  // Test 10: d.text().primary()._meta.generate === undefined
  it('leaves generate undefined when not specified', () => {
    const col = d.text().primary();
    expect(col._meta.generate).toBeUndefined();
  });

  // Test 11: d.text().primary({ generate: 'cuid' })._meta.primary === true
  it('sets primary: true with generate option', () => {
    const col = d.text().primary({ generate: 'cuid' });
    expect(col._meta.primary).toBe(true);
  });

  // Test 12: d.text().primary({ generate: 'cuid' })._meta.hasDefault === true
  it('sets hasDefault: true with generate option', () => {
    const col = d.text().primary({ generate: 'cuid' });
    expect(col._meta.hasDefault).toBe(true);
  });

  // Test 13: d.uuid().primary({ generate: 'uuid' })._meta works correctly
  it('works with uuid column type', () => {
    const col = d.uuid().primary({ generate: 'uuid' });
    expect(col._meta.generate).toBe('uuid');
    expect(col._meta.primary).toBe(true);
    expect(col._meta.hasDefault).toBe(true);
  });
});
