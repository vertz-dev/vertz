import { FormatSchema } from './format-schema';

const CUID_RE = /^c[a-z0-9]{24}$/;
export class CuidSchema extends FormatSchema {
  _errorMessage = 'Invalid CUID';
  _validate(value) {
    return CUID_RE.test(value);
  }
}
//# sourceMappingURL=cuid.js.map
