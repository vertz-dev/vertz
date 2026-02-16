import { FormatSchema } from './format-schema';

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
export class EmailSchema extends FormatSchema {
  _errorMessage = 'Invalid email';
  _validate(value) {
    return EMAIL_RE.test(value);
  }
  _jsonSchemaExtra() {
    return { format: 'email' };
  }
}
//# sourceMappingURL=email.js.map
