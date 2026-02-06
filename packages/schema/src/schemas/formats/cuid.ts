import { FormatSchema } from './format-schema';

const CUID_RE = /^c[a-z0-9]{24}$/;

export class CuidSchema extends FormatSchema {
  protected _errorMessage = 'Invalid CUID';

  protected _validate(value: string): boolean {
    return CUID_RE.test(value);
  }
}
