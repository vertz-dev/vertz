/**
 * Type-level tests for css() and its related types.
 *
 * These tests verify that CSSInput, CSSOutput, and StyleEntry types
 * are enforced correctly. Checked by `tsc --noEmit` (typecheck),
 * not by vitest at runtime.
 */

import type { CSSInput, CSSOutput, StyleEntry } from '../css';
import { css } from '../css';

// ─── StyleEntry — string or nested record ─────────────────────────

// String entries are valid
const _strEntry: StyleEntry = 'p:4';
void _strEntry;

// Record entries (nested selectors) are valid
const _recEntry: StyleEntry = { '&::after': ['content:empty', 'block'] };
void _recEntry;

// @ts-expect-error - number is not a valid StyleEntry
const _badEntry: StyleEntry = 42;
void _badEntry;

// @ts-expect-error - boolean is not a valid StyleEntry
const _boolEntry: StyleEntry = true;
void _boolEntry;

// ─── CSSInput — record of named style blocks ─────────────────────

// Valid input with string entries
const _validInput: CSSInput = {
  card: ['p:4', 'bg:background', 'rounded:lg'],
  title: ['font:xl', 'weight:bold'],
};
void _validInput;

// Valid input with mixed entries (string + nested record)
const _mixedInput: CSSInput = {
  card: ['p:4', 'bg:background', { '&::after': ['content:empty', 'block'] }],
};
void _mixedInput;

// Empty style block is valid
const _emptyBlock: CSSInput = {
  empty: [],
};
void _emptyBlock;

const _badInput: CSSInput = {
  // @ts-expect-error - value must be an array, not a string
  card: 'p:4',
};
void _badInput;

// ─── CSSOutput — classNames map and css string ───────────────────

// CSSOutput has classNames and css
declare const output: CSSOutput;

const _classNames: Record<string, string> = output.classNames;
void _classNames;

const _cssStr: string = output.css;
void _cssStr;

// classNames values are strings
const _className: string = output.classNames['card'] as string;
void _className;

// ─── css() — return type ──────────────────────────────────────────

// css() returns CSSOutput
const result = css({
  card: ['p:4', 'bg:background'],
  title: ['font:xl'],
});

const _resultClassNames: Record<string, string> = result.classNames;
void _resultClassNames;

const _resultCss: string = result.css;
void _resultCss;

// Accessing a specific class name
const _cardClass: string | undefined = result.classNames['card'];
void _cardClass;

// ─── css() — input validation ─────────────────────────────────────

// Valid call with string entries
const _valid1 = css({ root: ['p:4', 'bg:primary'] });
void _valid1;

// Valid call with nested records
const _valid2 = css({
  root: ['p:4', { '&:hover': ['bg:primary.700'] }],
});
void _valid2;

// Valid call with filePath argument
const _valid3 = css({ root: ['p:4'] }, '/app/components/card.ts');
void _valid3;

// @ts-expect-error - entries must be StyleEntry[], not number[]
css({ root: [42] });

// @ts-expect-error - first argument must be CSSInput, not string
css('p:4');

// ─── css() — output structure ─────────────────────────────────────

// Output classNames is a Record<string, string>
const styles = css({
  container: ['p:4'],
  header: ['font:lg'],
  footer: ['mt:4'],
});

const _containerClass: string | undefined = styles.classNames['container'];
const _headerClass: string | undefined = styles.classNames['header'];
const _footerClass: string | undefined = styles.classNames['footer'];
void _containerClass;
void _headerClass;
void _footerClass;

// css property is a string
const _cssProperty: string = styles.css;
void _cssProperty;
