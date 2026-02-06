import { FormatSchema } from './format-schema';

const NANOID_RE = /^[A-Za-z0-9_-]{21}$/;

export class NanoidSchema extends FormatSchema {
  protected _errorMessage = 'Invalid nanoid';

  protected _validate(value: string): boolean {
    return NANOID_RE.test(value);
  }
}
