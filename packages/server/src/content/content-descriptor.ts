import type { SchemaLike } from '@vertz/db';

/**
 * A content type descriptor that implements SchemaLike.
 * Carries HTTP metadata alongside parse/validate behavior.
 */
export interface ContentDescriptor<T> extends SchemaLike<T> {
  /** Discriminator — distinguishes from plain SchemaLike */
  readonly _kind: 'content';
  /** MIME type for HTTP headers */
  readonly _contentType: string;
}

/**
 * Runtime check: is the given SchemaLike a ContentDescriptor?
 */
export function isContentDescriptor(
  value: SchemaLike<unknown>,
): value is ContentDescriptor<unknown> {
  return (
    value != null && typeof value === 'object' && '_kind' in value && value._kind === 'content'
  );
}
