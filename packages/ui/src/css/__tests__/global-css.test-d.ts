/**
 * Type-level tests for globalCss().
 *
 * Covers the nested at-rule shape — @keyframes with from/to/percent frame
 * selectors, and @media / @supports with nested selector blocks. Tests
 * exercise the generic input mapping on globalCss() rather than the
 * public `GlobalCSSInput` alias, because the per-key discrimination
 * between declarations and nested-selector blocks only narrows through
 * the function signature.
 */

import { globalCss } from '../global-css';

// ─── Regular selectors with CSS declarations ──────────────────────

globalCss({
  body: { margin: '0', fontFamily: 'system-ui' },
  ':root': { '--color-primary': '#3b82f6' },
  '*, *::before, *::after': { boxSizing: 'border-box' },
});

// ─── @keyframes with from/to ──────────────────────────────────────

globalCss({
  '@keyframes spin': {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },
});

// ─── @keyframes with percentage frames and camelCase properties ───

globalCss({
  '@keyframes pulse': {
    '0%': { opacity: '1' },
    '50%': { opacity: '0.5', backgroundColor: 'red' },
    '100%': { opacity: '1' },
  },
});

// ─── @media with nested selector blocks ───────────────────────────

globalCss({
  '@media (min-width: 768px)': {
    body: { fontSize: '18px' },
  },
});

// ─── @supports with nested selector blocks ────────────────────────

globalCss({
  '@supports (display: grid)': {
    body: { display: 'grid' },
  },
});

// ─── Typos on a flat block are still rejected ─────────────────────

globalCss({
  // @ts-expect-error — `bacgroundColor` is not a valid CSS property
  body: { bacgroundColor: 'red' },
});

// ─── Typos inside a @keyframes frame are still rejected ───────────

globalCss({
  '@keyframes broken': {
    // @ts-expect-error — `transfrom` is not a valid CSS property
    from: { transfrom: 'rotate(0deg)' },
  },
});

// ─── Mixing declarations and nested rules in one block is rejected ─

globalCss({
  body: {
    margin: '0',
    // @ts-expect-error — regular selector blocks only accept CSS declarations; nested at-rules aren't valid here.
    '@media (min-width: 768px)': { padding: '1rem' },
  },
});

// ─── A non-object value for a regular selector is rejected ────────

globalCss({
  // @ts-expect-error — a selector block must be an object, not a string.
  body: 'red',
});

// ─── A non-object value for an at-rule is rejected ────────────────

globalCss({
  // @ts-expect-error — at-rule blocks must be nested selector maps, not strings.
  '@keyframes spin': 'rotate(0deg)',
});
