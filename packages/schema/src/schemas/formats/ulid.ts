import { FormatSchema } from './format-schema';

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class UlidSchema extends FormatSchema {
  protected _errorMessage = 'Invalid ULID';

  protected _validate(value: string): boolean {
    return ULID_RE.test(value);
  }
}
