import { FormatSchema } from './format-schema';

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export class EmailSchema extends FormatSchema {
  protected _errorMessage = 'Invalid email';

  protected _validate(value: string): boolean {
    return EMAIL_RE.test(value);
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'email' };
  }
}
