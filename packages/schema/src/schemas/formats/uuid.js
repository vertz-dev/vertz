import { FormatSchema } from './format-schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class UuidSchema extends FormatSchema {
  _errorMessage = 'Invalid UUID';
  _validate(value) {
    return UUID_RE.test(value);
  }
  _jsonSchemaExtra() {
    return { format: 'uuid' };
  }
}
//# sourceMappingURL=uuid.js.map
