import { FormatSchema } from './format-schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UuidSchema extends FormatSchema {
  protected _errorMessage = 'Invalid UUID';

  protected _validate(value: string): boolean {
    return UUID_RE.test(value);
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'uuid' };
  }
}
