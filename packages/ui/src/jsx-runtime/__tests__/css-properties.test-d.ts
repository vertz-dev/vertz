import type { CSSProperties } from '../css-properties';

// --- Positive: valid CSS properties accepted ---
void ({ backgroundColor: 'red', opacity: 0.5 } satisfies CSSProperties);
void ({ width: 200, height: 100 } satisfies CSSProperties);
void ({ '--my-color': 'red', '--grid-columns': 3 } satisfies CSSProperties);
void ({ zIndex: 10, fontWeight: 600, lineHeight: 1.5 } satisfies CSSProperties);

// --- Negative: invalid values rejected ---

// @ts-expect-error — boolean values not accepted for CSS properties
void ({ width: true } satisfies CSSProperties);

// @ts-expect-error — array values not accepted for CSS properties
void ({ width: [1, 2] } satisfies CSSProperties);
