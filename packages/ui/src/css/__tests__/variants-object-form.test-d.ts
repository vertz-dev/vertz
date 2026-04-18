/**
 * Type-level tests for variants() accepting StyleBlock input.
 */

import { variants } from '../variants';

// Object-form base + variant options typecheck
const _basic = variants({
  base: { display: 'flex', padding: 4 },
  variants: {
    intent: {
      primary: { backgroundColor: 'red' },
      ghost: { backgroundColor: 'transparent' },
    },
    size: {
      sm: { fontSize: 12 },
      md: { fontSize: 14 },
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
});
void _basic({ intent: 'primary', size: 'sm' });

// Compound variants with object styles
const _compound = variants({
  base: { display: 'inline-flex' },
  variants: {
    intent: { danger: { color: 'red' } },
    size: { sm: { fontSize: 12 } },
  },
  compoundVariants: [{ intent: 'danger', size: 'sm', styles: { padding: 4 } }],
});
void _compound;

// Object-form base with raw CSS values
const _mixed = variants({
  base: { padding: 4 },
  variants: { tone: { muted: { color: 'var(--color-muted-foreground)' } } },
});
void _mixed;

// @ts-expect-error — unknown variant name rejected
_basic({ typo: 'primary' });

// @ts-expect-error — unknown option value rejected
_basic({ intent: 'nope' });

void variants({
  // @ts-expect-error — typo in CSS property rejected at type level
  base: { bacgroundColor: 'red' },
  variants: {},
});

// prettier-ignore
// @ts-expect-error — typo nested inside base selector
void variants({ base: { padding: 4, '&:hover': { bacgroundColor: 'red' } }, variants: {} });

// prettier-ignore
// @ts-expect-error — typo inside a variant option block
void variants({ base: { padding: 4 }, variants: { intent: { primary: { bacgroundColor: 'red' } } } });

// prettier-ignore
// @ts-expect-error — typo inside compoundVariants styles block
void variants({ base: { padding: 4 }, variants: { intent: { primary: { color: 'red' } } }, compoundVariants: [{ intent: 'primary', styles: { bacgroundColor: 'red' } }] });
