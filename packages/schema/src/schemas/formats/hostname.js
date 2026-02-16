import { FormatSchema } from './format-schema';

const HOSTNAME_RE =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
export class HostnameSchema extends FormatSchema {
  _errorMessage = 'Invalid hostname';
  _validate(value) {
    return HOSTNAME_RE.test(value) && value.length <= 253;
  }
  _jsonSchemaExtra() {
    return { format: 'hostname' };
  }
}
//# sourceMappingURL=hostname.js.map
