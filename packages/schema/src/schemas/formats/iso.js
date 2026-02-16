import { FormatSchema } from './format-schema';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const ISO_DURATION_RE = /^P(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
function validateDateRange(value) {
  const parts = value.split('-').map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const d = parts[2] ?? 0;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}
function validateTimeRange(value) {
  const parts = value.split(':').map((v) => Number(v.replace(/[^0-9.]/g, '')));
  const h = parts[0] ?? 0;
  const min = parts[1] ?? 0;
  const s = parts[2] ?? 0;
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 && s >= 0 && s <= 59;
}
export class IsoDateSchema extends FormatSchema {
  _errorMessage = 'Invalid ISO date';
  _validate(value) {
    return ISO_DATE_RE.test(value) && validateDateRange(value);
  }
  _jsonSchemaExtra() {
    return { format: 'date' };
  }
}
export class IsoTimeSchema extends FormatSchema {
  _errorMessage = 'Invalid ISO time';
  _validate(value) {
    return ISO_TIME_RE.test(value) && validateTimeRange(value);
  }
  _jsonSchemaExtra() {
    return { format: 'time' };
  }
}
export class IsoDatetimeSchema extends FormatSchema {
  _errorMessage = 'Invalid ISO datetime';
  _validate(value) {
    if (!ISO_DATETIME_RE.test(value)) return false;
    const parts = value.split('T');
    const datePart = parts[0] ?? '';
    const timePart = parts[1] ?? '';
    return validateDateRange(datePart) && validateTimeRange(timePart);
  }
  _jsonSchemaExtra() {
    return { format: 'date-time' };
  }
}
export class IsoDurationSchema extends FormatSchema {
  _errorMessage = 'Invalid ISO duration';
  _validate(value) {
    return ISO_DURATION_RE.test(value) && value !== 'P';
  }
  _jsonSchemaExtra() {
    return { format: 'duration' };
  }
}
//# sourceMappingURL=iso.js.map
