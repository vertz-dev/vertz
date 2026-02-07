import { FormatSchema } from './format-schema';

const IPV4_RE = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

export class Ipv4Schema extends FormatSchema {
  protected _errorMessage = 'Invalid IPv4 address';

  protected _validate(value: string): boolean {
    const match = IPV4_RE.exec(value);
    if (!match) return false;
    return [match[1], match[2], match[3], match[4]].every((o) => Number(o) <= 255);
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'ipv4' };
  }
}
