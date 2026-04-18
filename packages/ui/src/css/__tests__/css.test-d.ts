/**
 * Type-level tests for css() and its related types.
 *
 * Covers the object-form-only API. Shorthand strings / array form were
 * removed in the drop-classname-utilities feature.
 */

import type { CSSInput, CSSOutput } from '../css';
import { css } from '../css';
import type { StyleBlock } from '../style-block';

// ─── StyleBlock — CSS declarations + nested selectors ─────────────

// Plain CSS properties (camelCase)
const _block1: StyleBlock = { padding: '1rem', backgroundColor: 'red' };
void _block1;

// Numeric values are valid (auto-px for length properties)
const _block2: StyleBlock = { padding: 16, marginTop: 8 };
void _block2;

// Nested pseudo-class selector
const _block3: StyleBlock = {
  padding: '1rem',
  '&:hover': { backgroundColor: 'blue' },
};
void _block3;

// Nested @media selector
const _block4: StyleBlock = {
  padding: '1rem',
  '@media (min-width: 640px)': { padding: '2rem' },
};
void _block4;

// Nested attribute selector
const _block5: StyleBlock = {
  '&[data-open="true"]': { opacity: '1' },
};
void _block5;

// CSS custom properties
const _block6: StyleBlock = { '--color-primary': '#000' };
void _block6;

// ─── CSSInput — record of named style blocks ─────────────────────

const _validInput: CSSInput = {
  card: { padding: '1rem', backgroundColor: 'red' },
  title: { fontSize: '1.25rem', fontWeight: 700 },
};
void _validInput;

// ─── CSSOutput — flat class names + css ───────────────────────────

declare const output: CSSOutput;

const _anyBlock: string | undefined = output.someBlock;
void _anyBlock;

const _cssStr: string = output.css;
void _cssStr;

// ─── css() — return type with literal keys ──────────────────────

const typed = css({
  card: { padding: '1rem', backgroundColor: 'red' },
  title: { fontSize: '1.25rem' },
});

const _card: string | undefined = typed.card;
void _card;

const _title: string | undefined = typed.title;
void _title;

const _resultCss: string = typed.css;
void _resultCss;

// ─── css() — input validation ─────────────────────────────────────

const _valid1 = css({ root: { padding: '1rem', backgroundColor: 'red' } });
void _valid1;

const _valid2 = css({
  root: { padding: '1rem', '&:hover': { backgroundColor: 'blue' } },
});
void _valid2;

const _valid3 = css(
  { root: { padding: '1rem' } },
  '/app/components/card.ts',
);
void _valid3;

// @ts-expect-error - block value must be a StyleBlock object, not a string
css({ root: 'padding: 1rem' });

// @ts-expect-error - first argument must be CSSInput, not string
css('padding: 1rem');

// ─── css() — object-form typo rejection (strict validator) ─────────

// @ts-expect-error — top-level typo in object-form block
css({ card: { bacgroundColor: 'red' } });

// @ts-expect-error — typo inside nested selector
css({ card: { padding: 16, '&:hover': { fooBar: 'baz' } } });

// prettier-ignore
// @ts-expect-error — typo inside @media nested block
css({ card: { padding: 16, '@media (min-width: 768px)': { bacgroundColor: 'red' } } });

// Valid object-form block — no error
css({
  card: { padding: 16, backgroundColor: 'red', '&:hover': { color: 'blue' } },
});
