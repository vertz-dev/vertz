import { FormatSchema } from './format-schema';

const HEX_RE = /^[0-9a-fA-F]+$/;
export class HexSchema extends FormatSchema {
  _errorMessage = 'Invalid hex string';
  _validate(value) {
    return HEX_RE.test(value);
  }
  _jsonSchemaExtra() {
    return { pattern: '^[0-9a-fA-F]+$' };
  }
}
//# sourceMappingURL=hex.js.map
