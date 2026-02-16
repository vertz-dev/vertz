import { FormatSchema } from './format-schema';

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
export class Base64Schema extends FormatSchema {
  _errorMessage = 'Invalid base64 string';
  _validate(value) {
    return BASE64_RE.test(value) && value.length % 4 === 0;
  }
  _jsonSchemaExtra() {
    return { contentEncoding: 'base64' };
  }
}
//# sourceMappingURL=base64.js.map
