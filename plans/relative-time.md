# Design: `formatRelativeTime()` Utility & `<RelativeTime>` Component

**Issue:** [#1654](https://github.com/vertz-dev/vertz/issues/1654)
**Status:** Review Complete — Awaiting Human Sign-off
**Author:** viniciusdacal

---

## Problem

The Linear clone has a hand-written `formatRelativeTime()` utility (~14 lines) for displaying "2m ago", "3h ago" etc. Every app with timestamped data needs this. Currently each app copy-pastes the same logic.

---

## API Surface

### 1. `formatRelativeTime(date, options?)` — Utility Function

```ts
import { formatRelativeTime } from '@vertz/ui';

// Basic usage — accepts Date, string, or number (epoch ms)
formatRelativeTime(new Date());           // "now"
formatRelativeTime('2026-03-21T10:00:00Z'); // "2 hours ago"
formatRelativeTime(Date.now() - 86400000);  // "1 day ago"

// With locale (uses Intl.RelativeTimeFormat)
formatRelativeTime(date, { locale: 'pt-BR' }); // "há 2 horas"

// With numeric: 'always' (forces numeric output)
formatRelativeTime(date, { numeric: 'always' }); // "1 day ago" instead of "yesterday"
```

#### Signature

```ts
type DateInput = Date | string | number;

interface FormatRelativeTimeOptions {
  /** BCP 47 locale tag. Defaults to user's locale via Intl defaults. */
  locale?: string;
  /** Intl.RelativeTimeFormat numeric option. Defaults to 'auto'. */
  numeric?: 'auto' | 'always';
  /** Reference time for "now". Defaults to `new Date()`. Useful for testing. */
  now?: Date;
}

function formatRelativeTime(date: DateInput, options?: FormatRelativeTimeOptions): string;
```

#### Thresholds

| Elapsed Time     | Unit    | Example Output     |
|------------------|---------|--------------------|
| < 10 seconds     | second  | "now" (via Intl)   |
| < 60 seconds     | second  | "30 seconds ago"   |
| < 60 minutes     | minute  | "5 minutes ago"    |
| < 24 hours       | hour    | "2 hours ago"      |
| < 7 days         | day     | "3 days ago"       |
| < 30 days        | week    | "2 weeks ago"      |
| < 365 days       | month   | "4 months ago"     |
| >= 365 days      | year    | "2 years ago"      |

Uses `Intl.RelativeTimeFormat` for **all** formatted output — including the `< 10 seconds` case, which uses `rtf.format(0, 'second')`. With `numeric: 'auto'`, this produces `"now"` in English (and locale-appropriate equivalents in other languages). No hand-rolled formatting strings. This gives us proper i18n for free.

**Threshold boundaries:** All thresholds use `Math.floor` for unit conversion. The boundary is exclusive on the lower end: e.g., exactly 7 days is `Math.floor(7/7) = 1` → "1 week ago", while 6 days is "6 days ago". Exactly 30 days is `Math.floor(30/7) = 4` → "4 weeks ago" (still in the week unit); 31 days crosses into months.

#### Future dates

Same thresholds apply with positive values: "in 5 minutes", "in 2 hours".

### 2. `<RelativeTime>` — Auto-Updating Component

```tsx
import { RelativeTime } from '@vertz/ui';

// Basic — renders <time> element, auto-updates
<RelativeTime date={comment.createdAt} />

// With locale
<RelativeTime date={comment.createdAt} locale="pt-BR" />

// Custom update interval (default: adaptive)
<RelativeTime date={comment.createdAt} updateInterval={30_000} />

// With className for styling
<RelativeTime date={comment.createdAt} className="text-muted" />
```

#### Props

```ts
interface RelativeTimeProps {
  /** The date to format. Accepts Date, ISO string, or epoch ms. */
  date: DateInput;
  /** BCP 47 locale tag. */
  locale?: string;
  /** Intl.RelativeTimeFormat numeric option. Defaults to 'auto'. */
  numeric?: 'auto' | 'always';
  /** Update interval in ms. Defaults to adaptive (see below). */
  updateInterval?: number;
  /** CSS class name for the <time> element. */
  className?: string;
  /** Title attribute (shown on hover). Defaults to full formatted date via Intl.DateTimeFormat. Set to false to disable. */
  title?: string | false;
}
```

#### Adaptive Update Interval

When `updateInterval` is not specified, the component picks a smart interval based on elapsed time:

| Elapsed Time     | Update Interval |
|------------------|-----------------|
| < 1 minute       | 10 seconds      |
| < 1 hour         | 1 minute        |
| < 1 day          | 1 hour          |
| >= 1 day         | No updates      |

This avoids unnecessary timers for old timestamps while keeping recent ones snappy.

#### Rendered HTML

```html
<time datetime="2026-03-21T10:00:00.000Z" title="March 21, 2026, 10:00:00 AM">2 hours ago</time>
```

The `datetime` attribute always contains the ISO string for machine readability and accessibility. The `title` attribute shows the full formatted date on hover (via `Intl.DateTimeFormat`). Pass `title={false}` to omit it.

#### Lifecycle

- Timer starts inside `onMount()` — this ensures it only runs on the client, not during SSR
- Uses `setTimeout` chains (not `setInterval`) so the interval can adapt as time elapses:
  ```ts
  onMount(() => {
    let timerId: ReturnType<typeof setTimeout>;
    function tick() {
      text = formatRelativeTime(date, { locale, numeric });
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
  ```
- `onMount`'s return function registers cleanup, integrating with Vertz's disposal system
- When the adaptive interval reaches `null` (>= 1 day), no further timeouts are scheduled

#### SSR Behavior

SSR renders the static formatted text. The timer only starts on the client via `onMount()`. There may be a minor text drift between SSR and client hydration (e.g., SSR renders "4 minutes ago", client hydrates with "5 minutes ago" if a threshold was crossed). This is acceptable for relative time display — the `datetime` attribute (machine-readable) is always correct, and the text updates on the next tick. This is consistent with how all major frameworks handle relative time.

#### Static Date Assumption

`<RelativeTime>` is designed for timestamps that don't change after render (e.g., `createdAt`, `updatedAt`). If the `date` prop changes dynamically, the timer interval calculated from the old date may be stale until the next tick. This is acceptable for the common case.

### Export Path

Both are exported from `@vertz/ui` (the main barrel):

```ts
import { formatRelativeTime, RelativeTime } from '@vertz/ui';
```

**Not from `@vertz/ui/components`.** The component proxy system (`@vertz/ui/components`) is for theme-bound components. `RelativeTime` has no theming — it renders a plain `<time>` element. This is consistent with how `Image`, `Link`, `ErrorBoundary`, `Suspense`, `Foreign`, `Presence`, `ListTransition`, and `Island` are exported directly from `@vertz/ui`.

---

## Manifesto Alignment

### Principle 2: One way to do things

One utility function, one component. No `timeAgo()` alias, no `<TimeAgo>` alternative. Developers reach for `formatRelativeTime` for static text and `<RelativeTime>` for live-updating UI.

### Principle 3: AI agents are first-class users

- Function name is fully descriptive: `formatRelativeTime` — an LLM can predict its behavior from the name alone.
- `DateInput = Date | string | number` — accepts all common timestamp representations. No need to pre-convert.
- Component props mirror the function options — no separate mental model.

### Principle 7: Performance is not optional

- Adaptive intervals mean we don't run 10-second timers for timestamps from last week.
- Old timestamps (>1 day) stop updating entirely — zero overhead.
- `Intl.RelativeTimeFormat` is engine-native, no bundle cost for i18n.

### Tradeoffs accepted

- **`Intl.RelativeTimeFormat` over custom formatting:** Trades exact control over output strings for free i18n and zero-maintenance locale support. Zero hand-rolled strings — even the `< 10 seconds` case uses `rtf.format(0, 'second')`.
- **Adaptive intervals over configurable granularity:** Simpler API. Developers who want different behavior can pass `updateInterval` directly.

### What was rejected

- **`<TimeAgo>` name** — too informal, not descriptive enough for LLMs.
- **Putting `RelativeTime` in `@vertz/ui/components`** — it has no theming layer, would require unnecessary theme registration.
- **Using `requestAnimationFrame` for updates** — overkill for second-level precision. `setTimeout` chains are simpler and sufficient.
- **`setInterval` for timer** — can't change period after creation, incompatible with adaptive intervals. `setTimeout` chains allow recalculating the interval on each tick.
- **Relative time "styles" (long/short/narrow)** — `Intl.RelativeTimeFormat` supports these, but adding them as props creates ambiguity. We use `long` style always for readability. Can be extended later if needed.

---

## Non-Goals

- **Absolute date formatting** — `Intl.DateTimeFormat` exists. We don't wrap it.
- **Duration formatting** — "2h 30m" countdown-style formatting is a different utility.
- **Server-side rendering of "live" time** — SSR renders the static text. The timer only starts on the client via `onMount()`. Minor text drift between SSR and hydration is acceptable (see SSR Behavior section above).
- **Timezone conversion** — `Date` handles this. We format relative differences, not absolute times.

---

## Unknowns

None identified. `Intl.RelativeTimeFormat` is well-supported in all target environments (Bun, modern browsers). The implementation is straightforward.

---

## POC Results

Not needed. The existing Linear clone implementation validates the core concept. The enhancement is i18n support via `Intl.RelativeTimeFormat` and auto-updating via reactive timers.

---

## Type Flow Map

This feature has no generics. Types are simple:

```
DateInput (Date | string | number)
  → formatRelativeTime(date: DateInput, options?: FormatRelativeTimeOptions): string
  → <RelativeTime date={DateInput} ... />
      → renders <time datetime={string}>{string}</time>
```

No dead generics. No type parameters to trace.

---

## E2E Acceptance Test

### Utility function

```ts
import { formatRelativeTime } from '@vertz/ui';

// Fixed "now" for deterministic tests
const now = new Date('2026-03-21T12:00:00Z');

// Now (< 10 seconds) — uses Intl.RelativeTimeFormat(0, 'second') with numeric: 'auto'
expect(formatRelativeTime(now, { now })).toBe('now');

// Seconds ago
expect(formatRelativeTime(new Date('2026-03-21T11:59:30Z'), { now }))
  .toBe('30 seconds ago');

// Minutes ago
expect(formatRelativeTime(new Date('2026-03-21T11:55:00Z'), { now }))
  .toBe('5 minutes ago');

// Hours ago
expect(formatRelativeTime(new Date('2026-03-21T10:00:00Z'), { now }))
  .toBe('2 hours ago');

// Days ago
expect(formatRelativeTime(new Date('2026-03-18T12:00:00Z'), { now }))
  .toBe('3 days ago');

// Accepts string input
expect(formatRelativeTime('2026-03-21T11:00:00Z', { now }))
  .toBe('1 hour ago');

// Accepts number input
expect(formatRelativeTime(now.getTime() - 3600000, { now }))
  .toBe('1 hour ago');

// Future dates
expect(formatRelativeTime(new Date('2026-03-21T14:00:00Z'), { now }))
  .toBe('in 2 hours');

// @ts-expect-error — invalid date type
formatRelativeTime(true);

// @ts-expect-error — invalid option
formatRelativeTime(now, { invalid: true });
```

### Component

```tsx
import { RelativeTime } from '@vertz/ui';

// Renders <time> element with datetime and title attributes
const el = <RelativeTime date="2026-03-21T10:00:00Z" />;
expect(el.tagName).toBe('TIME');
expect(el.getAttribute('datetime')).toBe('2026-03-21T10:00:00.000Z');
expect(el.getAttribute('title')).toBeTruthy(); // full formatted date
expect(el.textContent).toContain('ago');

// Accepts className
const styled = <RelativeTime date={new Date()} className="text-muted" />;
expect(styled.className).toContain('text-muted');

// Title can be disabled
const noTitle = <RelativeTime date={new Date()} title={false} />;
expect(noTitle.hasAttribute('title')).toBe(false);

// @ts-expect-error — date is required
<RelativeTime />;
```

---

## Implementation Plan

### Phase 1: `formatRelativeTime()` utility

**Deliverables:**
- `packages/ui/src/format/relative-time.ts` — implementation using `Intl.RelativeTimeFormat`
- `packages/ui/src/format/index.ts` — barrel export
- Export from `packages/ui/src/index.ts`
- Tests in `packages/ui/src/format/__tests__/relative-time.test.ts`

**Acceptance Criteria:**

```ts
describe('Feature: formatRelativeTime', () => {
  describe('Given a date that is less than 10 seconds ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "now" via Intl (locale-aware)', () => {});
    });
  });

  describe('Given a date that is 30 seconds ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "30 seconds ago"', () => {});
    });
  });

  describe('Given a date that is 5 minutes ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "5 minutes ago"', () => {});
    });
  });

  describe('Given a date that is 2 hours ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "2 hours ago"', () => {});
    });
  });

  describe('Given a date that is 3 days ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "3 days ago"', () => {});
    });
  });

  describe('Given a date that is 2 weeks ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "2 weeks ago"', () => {});
    });
  });

  describe('Given a date that is 4 months ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "4 months ago"', () => {});
    });
  });

  describe('Given a date that is 2 years ago', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "2 years ago"', () => {});
    });
  });

  describe('Given a future date that is 2 hours from now', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns "in 2 hours"', () => {});
    });
  });

  describe('Given a string date input', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then parses and formats correctly', () => {});
    });
  });

  describe('Given a number (epoch ms) date input', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then parses and formats correctly', () => {});
    });
  });

  describe('Given a locale option of "pt-BR"', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then returns localized output', () => {});
    });
  });

  describe('Given numeric: "always"', () => {
    describe('When formatRelativeTime is called with a date 1 day ago', () => {
      it('Then returns "1 day ago" instead of "yesterday"', () => {});
    });
  });

  describe('Given a custom "now" reference', () => {
    describe('When formatRelativeTime is called', () => {
      it('Then calculates relative time from the provided reference', () => {});
    });
  });
});
```

### Phase 2: `<RelativeTime>` component

**Deliverables:**
- `packages/ui/src/format/relative-time-component.tsx` — reactive component
- Export from `packages/ui/src/index.ts`
- Tests in `packages/ui/src/format/__tests__/relative-time-component.test.tsx`

**Acceptance Criteria:**

```ts
describe('Feature: RelativeTime component', () => {
  describe('Given a date prop', () => {
    describe('When the component renders', () => {
      it('Then renders a <time> element', () => {});
      it('Then sets datetime attribute to ISO string', () => {});
      it('Then displays formatted relative time as text content', () => {});
    });
  });

  describe('Given a className prop', () => {
    describe('When the component renders', () => {
      it('Then applies the className to the <time> element', () => {});
    });
  });

  describe('Given no title prop', () => {
    describe('When the component renders', () => {
      it('Then sets title attribute to full formatted date via Intl.DateTimeFormat', () => {});
    });
  });

  describe('Given title={false}', () => {
    describe('When the component renders', () => {
      it('Then omits the title attribute', () => {});
    });
  });

  describe('Given a custom title string', () => {
    describe('When the component renders', () => {
      it('Then sets the title attribute to the custom string', () => {});
    });
  });

  describe('Given a recent date (< 1 minute)', () => {
    describe('When time passes', () => {
      it('Then auto-updates the displayed text', () => {});
    });
  });

  describe('Given a date that is more than 1 day old', () => {
    describe('When the component renders', () => {
      it('Then no update timer is scheduled', () => {});
    });
  });

  describe('Given a custom updateInterval prop', () => {
    describe('When the component renders', () => {
      it('Then uses the custom interval instead of adaptive', () => {});
    });
  });

  describe('Given the component is disposed', () => {
    describe('When cleanup runs', () => {
      it('Then clears the update timeout', () => {});
    });
  });
});
```

### Phase 3: Documentation

**Deliverables:**
- `packages/docs/api-reference/ui/relative-time.mdx` — API reference page
- Update `packages/docs/docs.json` navigation to include the new page
- Update linear clone example to use the framework utility

**Acceptance Criteria:**
- Doc page covers: signature, options table, component props table, examples, adaptive interval explanation
- Navigation entry appears in the `vertz/ui` API reference group
- Linear clone `format.ts` replaced with `import { formatRelativeTime } from '@vertz/ui'`
