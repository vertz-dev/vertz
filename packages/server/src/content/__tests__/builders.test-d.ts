import { describe, expectTypeOf, it } from 'bun:test';
import type { SchemaLike } from '@vertz/db';
import { type ContentDescriptor, content, isContentDescriptor } from '../index';

describe('Type flow: content descriptors', () => {
  it('content.xml() returns ContentDescriptor<string>', () => {
    const d = content.xml();
    expectTypeOf(d).toMatchTypeOf<ContentDescriptor<string>>();
  });

  it('content.html() returns ContentDescriptor<string>', () => {
    const d = content.html();
    expectTypeOf(d).toMatchTypeOf<ContentDescriptor<string>>();
  });

  it('content.text() returns ContentDescriptor<string>', () => {
    const d = content.text();
    expectTypeOf(d).toMatchTypeOf<ContentDescriptor<string>>();
  });

  it('content.binary() returns ContentDescriptor<Uint8Array>', () => {
    const d = content.binary();
    expectTypeOf(d).toMatchTypeOf<ContentDescriptor<Uint8Array>>();
  });

  it('ContentDescriptor<string> extends SchemaLike<string>', () => {
    const d = content.xml();
    expectTypeOf(d).toMatchTypeOf<SchemaLike<string>>();
  });

  it('ContentDescriptor<Uint8Array> extends SchemaLike<Uint8Array>', () => {
    const d = content.binary();
    expectTypeOf(d).toMatchTypeOf<SchemaLike<Uint8Array>>();
  });

  it('isContentDescriptor narrows to ContentDescriptor', () => {
    const schema: SchemaLike<unknown> = content.xml();
    if (isContentDescriptor(schema)) {
      expectTypeOf(schema).toMatchTypeOf<ContentDescriptor<unknown>>();
      expectTypeOf(schema._contentType).toBeString();
    }
  });
});
