import { FormatSchema } from './format-schema';

const NANOID_RE = /^[A-Za-z0-9_-]{21}$/;
export class NanoidSchema extends FormatSchema {
  _errorMessage = 'Invalid nanoid';
  _validate(value) {
    return NANOID_RE.test(value);
  }
}
//# sourceMappingURL=nanoid.js.map
