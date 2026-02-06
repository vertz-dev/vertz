import { FormatSchema } from './format-schema';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const ISO_DURATION_RE = /^P(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;

function validateDateRange(value: string): boolean {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function validateTimeRange(value: string): boolean {
  const [h, min, s] = value.split(':').map(v => Number(v.replace(/[^0-9.]/g, '')));
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 && s >= 0 && s <= 59;
}

export class IsoDateSchema extends FormatSchema {
  protected _errorMessage = 'Invalid ISO date';

  protected _validate(value: string): boolean {
    return ISO_DATE_RE.test(value) && validateDateRange(value);
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'date' };
  }
}

export class IsoTimeSchema extends FormatSchema {
  protected _errorMessage = 'Invalid ISO time';

  protected _validate(value: string): boolean {
    return ISO_TIME_RE.test(value) && validateTimeRange(value);
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'time' };
  }
}

export class IsoDatetimeSchema extends FormatSchema {
  protected _errorMessage = 'Invalid ISO datetime';

  protected _validate(value: string): boolean {
    if (!ISO_DATETIME_RE.test(value)) return false;
    const [datePart, timePart] = value.split('T');
    return validateDateRange(datePart) && validateTimeRange(timePart);
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'date-time' };
  }
}

export class IsoDurationSchema extends FormatSchema {
  protected _errorMessage = 'Invalid ISO duration';

  protected _validate(value: string): boolean {
    return ISO_DURATION_RE.test(value) && value !== 'P';
  }

  protected _jsonSchemaExtra(): Record<string, unknown> {
    return { format: 'duration' };
  }
}
