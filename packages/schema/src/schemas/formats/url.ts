import { FormatSchema } from './format-schema';

export class UrlSchema extends FormatSchema {
  protected _errorMessage = 'Invalid URL';

  protected _validate(value: string): boolean {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'uri' };
  }
}
