import { FormatSchema } from './format-schema';

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export class Base64Schema extends FormatSchema {
  protected _errorMessage = 'Invalid base64 string';

  protected _validate(value: string): boolean {
    return BASE64_RE.test(value) && value.length % 4 === 0;
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { contentEncoding: 'base64' };
  }
}
