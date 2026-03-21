export type DateInput = Date | string | number;

export interface FormatRelativeTimeOptions {
  /** BCP 47 locale tag. Defaults to user's locale via Intl defaults. */
  locale?: string;
  /** Intl.RelativeTimeFormat numeric option. Defaults to 'auto'. */
  numeric?: 'auto' | 'always';
  /** Reference time for "now". Defaults to `new Date()`. Useful for testing. */
  now?: Date;
}

export function toDate(date: DateInput): Date {
  if (date instanceof Date) return date;
  if (typeof date === 'number') return new Date(date);
  return new Date(date);
}

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

function getFormatter(
  locale?: string,
  numeric: 'auto' | 'always' = 'auto',
): Intl.RelativeTimeFormat {
  const key = `${locale ?? ''}:${numeric}`;
  let rtf = rtfCache.get(key);
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric, style: 'long' });
    rtfCache.set(key, rtf);
  }
  return rtf;
}

export function formatRelativeTime(date: DateInput, options?: FormatRelativeTimeOptions): string {
  const now = options?.now ?? new Date();
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`formatRelativeTime: invalid date input: ${String(date)}`);
  }
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);

  const locale = options?.locale;
  const numeric = options?.numeric ?? 'auto';
  const rtf = getFormatter(locale, numeric);

  const sign = diffMs >= 0 ? -1 : 1;

  if (diffSec < 10) {
    return rtf.format(0, 'second');
  }

  if (diffSec < 60) {
    return rtf.format(sign * diffSec, 'second');
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return rtf.format(sign * diffMin, 'minute');
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return rtf.format(sign * diffHours, 'hour');
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return rtf.format(sign * diffDays, 'day');
  }

  if (diffDays < 30) {
    const diffWeeks = Math.floor(diffDays / 7);
    return rtf.format(sign * diffWeeks, 'week');
  }

  if (diffDays < 365) {
    const diffMonths = Math.floor(diffDays / 30);
    return rtf.format(sign * diffMonths, 'month');
  }

  const diffYears = Math.floor(diffDays / 365);
  return rtf.format(sign * diffYears, 'year');
}
