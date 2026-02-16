import { FormatSchema } from './format-schema';

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export class UlidSchema extends FormatSchema {
  _errorMessage = 'Invalid ULID';
  _validate(value) {
    return ULID_RE.test(value);
  }
}
//# sourceMappingURL=ulid.js.map
