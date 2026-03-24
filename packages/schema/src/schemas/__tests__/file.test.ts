import { describe, expect, it } from 'bun:test';
import { SchemaType } from '../../core/types';
import { FileSchema } from '../file';

describe('FileSchema', () => {
  it('accepts Blob instances', () => {
    const schema = new FileSchema();
    const blob = new Blob(['hello'], { type: 'text/plain' });
    expect(schema.parse(blob).data).toBe(blob);
  });

  it('rejects non-Blob values', () => {
    const schema = new FileSchema();
    expect(schema.safeParse('hello').ok).toBe(false);
    expect(schema.safeParse(42).ok).toBe(false);
    expect(schema.safeParse({}).ok).toBe(false);
  });

  it('metadata.type returns SchemaType.File', () => {
    expect(new FileSchema().metadata.type).toBe(SchemaType.File);
  });

  it('toJSONSchema() returns content media type', () => {
    expect(new FileSchema().toJSONSchema()).toEqual({
      type: 'string',
      contentMediaType: 'application/octet-stream',
    });
  });

  it('_clone() preserves metadata', () => {
    const schema = new FileSchema().describe('file upload');
    expect(schema.metadata.description).toBe('file upload');
  });
});
