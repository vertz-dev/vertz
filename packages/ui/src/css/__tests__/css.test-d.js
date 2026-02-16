/**
 * Type-level tests for css() and its related types.
 *
 * These tests verify that CSSInput, CSSOutput, and StyleEntry types
 * are enforced correctly. Checked by `tsc --noEmit` (typecheck),
 * not by vitest at runtime.
 */
import { css } from '../css';

// ─── StyleEntry — string or nested record ─────────────────────────
// String entries are valid
const _strEntry = 'p:4';
void _strEntry;
// Record entries (nested selectors) are valid
const _recEntry = { '&::after': ['content:empty', 'block'] };
void _recEntry;
// @ts-expect-error - number is not a valid StyleEntry
const _badEntry = 42;
void _badEntry;
// @ts-expect-error - boolean is not a valid StyleEntry
const _boolEntry = true;
void _boolEntry;
// ─── CSSInput — record of named style blocks ─────────────────────
// Valid input with string entries
const _validInput = {
  card: ['p:4', 'bg:background', 'rounded:lg'],
  title: ['font:xl', 'weight:bold'],
};
void _validInput;
// Valid input with mixed entries (string + nested record)
const _mixedInput = {
  card: ['p:4', 'bg:background', { '&::after': ['content:empty', 'block'] }],
};
void _mixedInput;
// Empty style block is valid
const _emptyBlock = {
  empty: [],
};
void _emptyBlock;
const _badInput = {
  // @ts-expect-error - value must be an array, not a string
  card: 'p:4',
};
void _badInput;
const _classNames = output.classNames;
void _classNames;
const _cssStr = output.css;
void _cssStr;
// classNames values are strings
const _className = output.classNames.card;
void _className;
// ─── css() — return type ──────────────────────────────────────────
// css() returns CSSOutput
const result = css({
  card: ['p:4', 'bg:background'],
  title: ['font:xl'],
});
const _resultClassNames = result.classNames;
void _resultClassNames;
const _resultCss = result.css;
void _resultCss;
// Accessing a specific class name
const _cardClass = result.classNames.card;
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
const _containerClass = styles.classNames.container;
const _headerClass = styles.classNames.header;
const _footerClass = styles.classNames.footer;
void _containerClass;
void _headerClass;
void _footerClass;
// css property is a string
const _cssProperty = styles.css;
void _cssProperty;
//# sourceMappingURL=css.test-d.js.map
