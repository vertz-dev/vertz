import { FormatSchema } from './format-schema';

const IPV4_RE = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;
export class Ipv4Schema extends FormatSchema {
  _errorMessage = 'Invalid IPv4 address';
  _validate(value) {
    const match = IPV4_RE.exec(value);
    if (!match) return false;
    return [match[1], match[2], match[3], match[4]].every((o) => Number(o) <= 255);
  }
  _jsonSchemaExtra() {
    return { format: 'ipv4' };
  }
}
//# sourceMappingURL=ipv4.js.map
