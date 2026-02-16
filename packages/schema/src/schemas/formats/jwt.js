import { FormatSchema } from './format-schema';

const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export class JwtSchema extends FormatSchema {
  _errorMessage = 'Invalid JWT';
  _validate(value) {
    return JWT_RE.test(value);
  }
}
//# sourceMappingURL=jwt.js.map
