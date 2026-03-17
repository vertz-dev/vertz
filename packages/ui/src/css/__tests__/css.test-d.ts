/**
 * Type-level tests for css() and its related types.
 *
 * These tests verify that CSSInput, CSSOutput, and StyleEntry types
 * are enforced correctly. Checked by `tsc --noEmit` (typecheck),
 * not by vitest at runtime.
 */

import type { CSSInput, CSSOutput, StyleEntry, StyleValue } from '../css';
import { css } from '../css';

// Verify UtilityClass is assignable to string (compile-time only, no runtime)
const _utilCheck: string = '' as import('../utility-types').UtilityClass;
void _utilCheck;

// ─── StyleValue — string or CSS declarations map ───────────────────

// String values are valid
const _strVal: StyleValue = 'p:4';
void _strVal;

// CSS declarations maps are valid
const _objVal: StyleValue = { 'flex-direction': 'row' };
void _objVal;

// ─── StyleEntry — string or nested record ─────────────────────────

// String entries are valid
const _strEntry: StyleEntry = 'p:4';
void _strEntry;

// Record entries with array values (nested selectors) are valid
const _recEntry: StyleEntry = { '&::after': ['content:empty', 'block'] };
void _recEntry;

// Record entries with direct object values are valid
const _directObjEntry: StyleEntry = { '@media (min-width: 640px)': { 'flex-direction': 'row' } };
void _directObjEntry;

// Mixed: array with CSS objects inside
const _mixedArrayEntry: StyleEntry = {
  '&:hover': ['text:foreground', { 'background-color': 'red' }],
};
void _mixedArrayEntry;

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

// ─── CSSOutput — flat class names + css ───────────────────────────

// Bare CSSOutput has string index signature (values are string | undefined)
declare const output: CSSOutput;

const _anyBlock: string | undefined = output.someBlock;
void _anyBlock;

const _cssStr: string = output.css;
void _cssStr;

// ─── css() — return type with literal keys ──────────────────────

const typed = css({
  card: ['p:4', 'bg:background'],
  title: ['font:xl'],
});

// Block names are top-level string properties
const _card: string = typed.card;
void _card;

const _title: string = typed.title;
void _title;

// css property is accessible
const _resultCss: string = typed.css;
void _resultCss;

// @ts-expect-error - classNames no longer exists
void typed.classNames;

// @ts-expect-error - 'css' is a reserved block name
css({ css: ['p:4'] });

// ─── css() — input validation ─────────────────────────────────────

// Valid call with string entries
const _valid1 = css({ root: ['p:4', 'bg:primary'] });
void _valid1;

// Valid call with nested records (array form)
const _valid2 = css({
  root: ['p:4', { '&:hover': ['bg:primary.700'] }],
});
void _valid2;

// Valid call with direct object form for media queries
const _valid2b = css({
  root: ['p:4', { '@media (min-width: 640px)': { 'flex-direction': 'row' } }],
});
void _valid2b;

// Valid call with CSS object in array
const _valid2c = css({
  root: ['p:4', { '&:hover': [{ 'background-color': 'red', opacity: '1' }] }],
});
void _valid2c;

// Valid call with filePath argument
const _valid3 = css({ root: ['p:4'] }, '/app/components/card.ts');
void _valid3;

// @ts-expect-error - entries must be StyleEntry[], not number[]
css({ root: [42] });

// @ts-expect-error - first argument must be CSSInput, not string
css('p:4');

// ─── css() — output structure ─────────────────────────────────────

const styles = css({
  container: ['p:4'],
  header: ['font:lg'],
  footer: ['mt:4'],
});

// Block names are directly on the result
const _containerClass: string = styles.container;
const _headerClass: string = styles.header;
const _footerClass: string = styles.footer;
void _containerClass;
void _headerClass;
void _footerClass;

// css property is a string
const _cssProperty: string = styles.css;
void _cssProperty;

// ─── UtilityClass — type-safe CSS utility strings ─────────────────

// Valid keywords
const _keyword1: StyleEntry = 'flex';
const _keyword2: StyleEntry = 'grid';
const _keyword3: StyleEntry = 'hidden';
const _keyword4: StyleEntry = 'inline-flex';
const _keyword5: StyleEntry = 'flex-col';
const _keyword6: StyleEntry = 'shrink-0';
const _keyword7: StyleEntry = 'whitespace-nowrap';
void _keyword1;
void _keyword2;
void _keyword3;
void _keyword4;
void _keyword5;
void _keyword6;
void _keyword7;

// Valid spacing utilities
const _spacing1: StyleEntry = 'p:4';
const _spacing2: StyleEntry = 'mx:auto';
const _spacing3: StyleEntry = 'gap:2';
const _spacing4: StyleEntry = 'mt:0.5';
const _spacing5: StyleEntry = 'pb:96';
void _spacing1;
void _spacing2;
void _spacing3;
void _spacing4;
void _spacing5;

// Valid color utilities
const _color1: StyleEntry = 'bg:primary';
const _color2: StyleEntry = 'bg:primary.700';
const _color3: StyleEntry = 'bg:transparent';
const _color4: StyleEntry = 'bg:white';
void _color1;
void _color2;
void _color3;
void _color4;

// Valid multi-mode text utilities
const _text1: StyleEntry = 'text:foreground';
const _text2: StyleEntry = 'text:sm';
const _text3: StyleEntry = 'text:center';
const _text4: StyleEntry = 'text:primary.500';
void _text1;
void _text2;
void _text3;
void _text4;

// Valid multi-mode font utilities
const _font1: StyleEntry = 'font:xl';
const _font2: StyleEntry = 'font:medium';
const _font3: StyleEntry = 'font:bold';
void _font1;
void _font2;
void _font3;

// Valid multi-mode border utilities
const _border1: StyleEntry = 'border:border';
const _border2: StyleEntry = 'border:1';
void _border1;
void _border2;

// Valid size utilities
const _size1: StyleEntry = 'w:full';
const _size2: StyleEntry = 'h:screen';
const _size3: StyleEntry = 'max-w:xl';
const _size4: StyleEntry = 'h:4';
void _size1;
void _size2;
void _size3;
void _size4;

// Valid radius, shadow, alignment, etc.
const _radius1: StyleEntry = 'rounded:lg';
const _shadow1: StyleEntry = 'shadow:md';
const _align1: StyleEntry = 'items:center';
const _align2: StyleEntry = 'justify:between';
const _weight1: StyleEntry = 'weight:bold';
const _leading1: StyleEntry = 'leading:tight';
const _content1: StyleEntry = 'content:empty';
void _radius1;
void _shadow1;
void _align1;
void _align2;
void _weight1;
void _leading1;
void _content1;

// Valid raw utilities (accept any value)
const _raw1: StyleEntry = 'cursor:pointer';
const _raw2: StyleEntry = 'z:10';
const _raw3: StyleEntry = 'opacity:0.5';
const _raw4: StyleEntry = 'transition:colors';
void _raw1;
void _raw2;
void _raw3;
void _raw4;

// Valid pseudo-prefixed utilities
const _pseudo1: StyleEntry = 'hover:bg:primary';
const _pseudo2: StyleEntry = 'focus:outline-none';
const _pseudo3: StyleEntry = 'disabled:opacity:0.5';
const _pseudo4: StyleEntry = 'hover:flex';
void _pseudo1;
void _pseudo2;
void _pseudo3;
void _pseudo4;

// Valid ring and list utilities
const _ring1: StyleEntry = 'ring:2';
const _ring2: StyleEntry = 'ring:primary';
const _list1: StyleEntry = 'list:none';
const _list2: StyleEntry = 'list:inside';
void _ring1;
void _ring2;
void _list1;
void _list2;

// ─── UtilityClass — INVALID strings must be rejected ──────────────

// @ts-expect-error — completely unknown utility
const _badUtil1: StyleEntry = 'typo-that-doesnt-exist';
void _badUtil1;

// @ts-expect-error — unknown property shorthand
const _badUtil2: StyleEntry = 'bgg:primary';
void _badUtil2;

// @ts-expect-error — invalid spacing value
const _badUtil3: StyleEntry = 'p:999';
void _badUtil3;

// @ts-expect-error — invalid color token (for bg, which validates colors)
const _badUtil4: StyleEntry = 'bg:nonexistent';
void _badUtil4;

// @ts-expect-error — invalid pseudo prefix
const _badUtil5: StyleEntry = 'hoverr:bg:primary';
void _badUtil5;

// @ts-expect-error — invalid keyword
const _badUtil6: StyleEntry = 'flexx';
void _badUtil6;

// @ts-expect-error — invalid radius value
const _badUtil7: StyleEntry = 'rounded:banana';
void _badUtil7;

// @ts-expect-error — invalid shadow value
const _badUtil8: StyleEntry = 'shadow:banana';
void _badUtil8;

// @ts-expect-error — invalid alignment value
const _badUtil9: StyleEntry = 'items:banana';
void _badUtil9;

// ─── UtilityClass in css() calls ───────────────────────────────────

// Valid css() call with all utility types
const _validFull = css({
  card: [
    'flex',
    'flex-col',
    'p:4',
    'bg:primary',
    'rounded:lg',
    'hover:bg:primary.700',
    'shadow:md',
    'items:center',
    { '&:hover': ['bg:muted', { 'text-decoration': 'underline' }] },
  ],
});
void _validFull;

// css() rejects invalid utilities
css({
  card: [
    'p:4',
    // @ts-expect-error — invalid utility in css() array
    'definitely-not-a-utility',
  ],
});
