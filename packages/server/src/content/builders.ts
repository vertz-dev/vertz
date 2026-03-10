import type { ContentDescriptor } from './content-descriptor';

/**
 * Creates a string-typed content descriptor.
 */
function stringDescriptor(contentType: string): ContentDescriptor<string> {
  return {
    _kind: 'content',
    _contentType: contentType,
    parse(value: unknown) {
      if (typeof value === 'string') {
        return { ok: true as const, data: value };
      }
      return { ok: false as const, error: new Error(`Expected string, got ${typeof value}`) };
    },
  };
}

export const content = {
  /** application/xml → string */
  xml: (): ContentDescriptor<string> => stringDescriptor('application/xml'),
  /** text/html → string */
  html: (): ContentDescriptor<string> => stringDescriptor('text/html'),
  /** text/plain → string */
  text: (): ContentDescriptor<string> => stringDescriptor('text/plain'),
  /** application/octet-stream → Uint8Array */
  binary: (): ContentDescriptor<Uint8Array> => ({
    _kind: 'content',
    _contentType: 'application/octet-stream',
    parse(value: unknown) {
      if (value instanceof Uint8Array) {
        return { ok: true as const, data: value };
      }
      return {
        ok: false as const,
        error: new Error(`Expected Uint8Array, got ${typeof value}`),
      };
    },
  }),
} as const;
