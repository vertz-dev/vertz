import { onMount } from '../component/lifecycle';
import type { DateInput, FormatRelativeTimeOptions } from './relative-time';
import { formatRelativeTime, toDate } from './relative-time';

export interface RelativeTimeProps {
  /** The date to format. Accepts Date, ISO string, or epoch ms. */
  date: DateInput;
  /** BCP 47 locale tag. */
  locale?: string;
  /** Intl.RelativeTimeFormat numeric option. Defaults to 'auto'. */
  numeric?: 'auto' | 'always';
  /** Update interval in ms. Defaults to adaptive. */
  updateInterval?: number;
  /** CSS class name for the <time> element. */
  className?: string;
  /** Title attribute (shown on hover). Defaults to full formatted date. Set to false to disable. */
  title?: string | false;
}

/**
 * Returns the adaptive update interval in ms based on elapsed time,
 * or null if no further updates are needed (>= 1 day).
 */
export function getAdaptiveInterval(date: DateInput): number | null {
  const d = toDate(date);
  const elapsedMs = Math.abs(Date.now() - d.getTime());
  const elapsedSec = elapsedMs / 1000;

  if (elapsedSec < 60) return 10_000;
  if (elapsedSec < 3600) return 60_000;
  if (elapsedSec < 86_400) return 3_600_000;
  return null;
}

/**
 * Auto-updating relative time component.
 * Renders a `<time>` element with the formatted relative time.
 * Uses `setTimeout` chains with adaptive intervals for live updates.
 * Timer starts in `onMount()` — safe for SSR (skipped on server).
 */
export function RelativeTime({
  date,
  locale,
  numeric,
  updateInterval,
  className,
  title,
}: RelativeTimeProps): HTMLTimeElement {
  const d = toDate(date);
  const isoString = d.toISOString();
  const opts: FormatRelativeTimeOptions = { locale, numeric };

  const el = document.createElement('time');
  el.setAttribute('datetime', isoString);
  el.textContent = formatRelativeTime(date, opts);

  if (title !== false) {
    el.title =
      typeof title === 'string'
        ? title
        : new Intl.DateTimeFormat(locale, {
            dateStyle: 'long',
            timeStyle: 'medium',
          }).format(d);
  }

  if (className) {
    el.className = className;
  }

  onMount(() => {
    let timerId: ReturnType<typeof setTimeout>;

    function tick() {
      el.textContent = formatRelativeTime(date, opts);
      const interval = updateInterval ?? getAdaptiveInterval(date);
      if (interval !== null) {
        timerId = setTimeout(tick, interval);
      }
    }

    const initialInterval = updateInterval ?? getAdaptiveInterval(date);
    if (initialInterval !== null) {
      timerId = setTimeout(tick, initialInterval);
    }

    return () => clearTimeout(timerId);
  });

  return el;
}
