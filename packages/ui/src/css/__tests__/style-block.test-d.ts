/**
 * Type-level tests for StyleBlock.
 *
 * StyleBlock is the object-form input for css() / variants() replacing the
 * token-string array shape. Checked by `vtz run typecheck`.
 */

import type { SelectorKey, StyleBlock, StyleDeclarations } from '../style-block';

// ─── StyleDeclarations — CSS properties with string | number values ────

const _flat: StyleDeclarations = {
  padding: 16,
  backgroundColor: 'red',
  opacity: 0.5,
  margin: 0,
  lineHeight: 1.4,
  zIndex: 10,
};
void _flat;

// Custom property accepted
const _customProp: StyleDeclarations = { '--my-var': 'red', color: 'var(--my-var)' };
void _customProp;

// Vendor prefix accepted (camelCase with capitalized prefix)
const _vendor: StyleDeclarations = { WebkitBackdropFilter: 'blur(8px)' };
void _vendor;

// String values accepted
const _stringValues: StyleDeclarations = {
  display: 'flex',
  flexDirection: 'row',
  color: 'var(--color-foreground)',
};
void _stringValues;

// @ts-expect-error — typo in property name
const _typo: StyleDeclarations = { bacgroundColor: 'red' };
void _typo;

// @ts-expect-error — boolean value rejected
const _boolVal: StyleDeclarations = { padding: true };
void _boolVal;

// @ts-expect-error — unknown property
const _unknown: StyleDeclarations = { hello: 'world' };
void _unknown;

// ─── SelectorKey — & or @ prefixed keys ─────────────────────────────

const _ampersand: SelectorKey = '&:hover';
const _atMedia: SelectorKey = '@media (min-width: 768px)';
const _ampersandAttr: SelectorKey = '&[data-state="open"]';
const _atSupports: SelectorKey = '@supports (display: grid)';
void _ampersand;
void _atMedia;
void _ampersandAttr;
void _atSupports;

// @ts-expect-error — plain string rejected
const _bareSelector: SelectorKey = 'hover';
void _bareSelector;

// @ts-expect-error — colon-prefixed rejected
const _colonSelector: SelectorKey = ':root';
void _colonSelector;

// ─── StyleBlock — declarations + nested selectors ────────────────────

// Flat CSS declarations assignable
const _block1: StyleBlock = { padding: 16, backgroundColor: 'red' };
void _block1;

// Nested & selector assignable
const _block2: StyleBlock = { color: 'white', '&:hover': { color: 'blue' } };
void _block2;

// Nested @media assignable
const _block3: StyleBlock = {
  padding: 8,
  '@media (min-width: 768px)': { padding: 24 },
};
void _block3;

// Deeply nested selectors (3 levels)
const _deep: StyleBlock = {
  color: 'red',
  '&:hover': {
    color: 'blue',
    '&[data-state="open"]': {
      color: 'green',
      '@media (min-width: 768px)': { color: 'purple' },
    },
  },
};
void _deep;

// Numeric auto-px candidate accepted
const _numeric: StyleBlock = { opacity: 0.5, zIndex: 10, padding: 16 };
void _numeric;

// Custom property accepted in block
const _customInBlock: StyleBlock = { '--gap': '8px', gap: 'var(--gap)' };
void _customInBlock;

// @ts-expect-error — typo at top level
const _blockTypo: StyleBlock = { bacgroundColor: 'red' };
void _blockTypo;

// @ts-expect-error — bare pseudo-class without & prefix
const _blockBarePseudo: StyleBlock = { hover: { color: 'blue' } };
void _blockBarePseudo;

// @ts-expect-error — selector key without & or @
const _blockBadKey: StyleBlock = { ':root': { color: 'blue' } };
void _blockBadKey;

// @ts-expect-error — numeric value for non-numeric CSS property rejected via value type
const _blockBadValue: StyleBlock = { padding: true };
void _blockBadValue;
