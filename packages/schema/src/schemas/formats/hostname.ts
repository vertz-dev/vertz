import { FormatSchema } from './format-schema';

const HOSTNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

export class HostnameSchema extends FormatSchema {
  protected _errorMessage = 'Invalid hostname';

  protected _validate(value: string): boolean {
    return HOSTNAME_RE.test(value) && value.length <= 253;
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'hostname' };
  }
}
