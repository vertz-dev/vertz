import { FormatSchema } from './format-schema';

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class JwtSchema extends FormatSchema {
  protected _errorMessage = 'Invalid JWT';

  protected _validate(value: string): boolean {
    return JWT_RE.test(value);
  }
}
