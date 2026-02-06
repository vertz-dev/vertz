import { FormatSchema } from './format-schema';

const HEX_RE = /^[0-9a-fA-F]+$/;

export class HexSchema extends FormatSchema {
  protected _errorMessage = 'Invalid hex string';

  protected _validate(value: string): boolean {
    return HEX_RE.test(value);
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { pattern: '^[0-9a-fA-F]+$' };
  }
}
