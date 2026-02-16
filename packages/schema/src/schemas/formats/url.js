import { FormatSchema } from './format-schema';
export class UrlSchema extends FormatSchema {
  _errorMessage = 'Invalid URL';
  _validate(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }
  _jsonSchemaExtra() {
    return { format: 'uri' };
  }
}
//# sourceMappingURL=url.js.map
