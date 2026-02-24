import { describe, expect, it } from 'bun:test';
import { formDataToObject } from '../form-data';

describe('formDataToObject', () => {
  it('converts FormData with string values to a plain object', () => {
    const fd = new FormData();
    fd.append('name', 'Alice');
    fd.append('email', 'alice@example.com');

    const result = formDataToObject(fd);

    expect(result).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  it('returns an empty object for empty FormData', () => {
    const fd = new FormData();

    const result = formDataToObject(fd);

    expect(result).toEqual({});
  });

  it('uses the last value when a key appears multiple times', () => {
    const fd = new FormData();
    fd.append('color', 'red');
    fd.append('color', 'blue');

    const result = formDataToObject(fd);

    expect(result).toEqual({ color: 'blue' });
  });

  it('coerces numeric strings to numbers when coerce option is enabled', () => {
    const fd = new FormData();
    fd.append('age', '25');
    fd.append('name', 'Bob');

    const result = formDataToObject(fd, { coerce: true });

    expect(result).toEqual({ age: 25, name: 'Bob' });
  });

  it('coerces boolean strings when coerce option is enabled', () => {
    const fd = new FormData();
    fd.append('active', 'true');
    fd.append('deleted', 'false');
    fd.append('name', 'Carol');

    const result = formDataToObject(fd, { coerce: true });

    expect(result).toEqual({ active: true, deleted: false, name: 'Carol' });
  });

  it('skips File entries and only includes string values', () => {
    const fd = new FormData();
    fd.append('name', 'Dave');
    fd.append('avatar', new File(['content'], 'avatar.png', { type: 'image/png' }));

    const result = formDataToObject(fd);

    expect(result).toEqual({ name: 'Dave' });
  });

  it('handles empty string values', () => {
    const fd = new FormData();
    fd.append('name', '');
    fd.append('bio', '');

    const result = formDataToObject(fd);

    expect(result).toEqual({ name: '', bio: '' });
  });

  it('does not coerce by default', () => {
    const fd = new FormData();
    fd.append('count', '42');
    fd.append('active', 'true');

    const result = formDataToObject(fd);

    expect(result).toEqual({ count: '42', active: 'true' });
  });
});
