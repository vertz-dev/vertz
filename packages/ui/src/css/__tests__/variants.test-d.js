/**
 * Type-level tests for the variants() API.
 *
 * These tests verify that generic type parameters flow correctly
 * through the variant definition and selection pipeline. They are
 * checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */
import { variants } from '../variants';

// ─── Basic variant type inference ───────────────────────────────
const button = variants({
  base: ['flex', 'rounded:md'],
  variants: {
    intent: {
      primary: ['bg:primary.600'],
      secondary: ['bg:background'],
    },
    size: {
      sm: ['h:8'],
      md: ['h:10'],
      lg: ['h:12'],
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
});
// Valid calls — these should all compile
const _noArgs = button();
void _noArgs;
const _withIntent = button({ intent: 'primary' });
void _withIntent;
const _withSize = button({ size: 'sm' });
void _withSize;
const _withBoth = button({ intent: 'secondary', size: 'lg' });
void _withBoth;
// @ts-expect-error - 'danger' is not a valid intent value
const _badIntent = button({ intent: 'danger' });
void _badIntent;
// @ts-expect-error - 'xl' is not a valid size value
const _badSize = button({ size: 'xl' });
void _badSize;
// @ts-expect-error - 'color' is not a valid variant name
const _badVariant = button({ color: 'red' });
void _badVariant;
// Valid props
const _validProps = { intent: 'primary', size: 'sm' };
void _validProps;
// All props are optional
const _emptyProps = {};
void _emptyProps;
// Partial props
const _partialProps = { size: 'md' };
void _partialProps;
// @ts-expect-error - 'danger' is not valid for intent
const _invalidProp = { intent: 'danger' };
void _invalidProp;
// ─── Compound variants type inference ───────────────────────────
const _withCompound = variants({
  base: ['rounded:md'],
  variants: {
    intent: {
      primary: ['bg:primary'],
      secondary: ['bg:secondary'],
    },
    size: {
      sm: ['h:8'],
      md: ['h:10'],
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
  compoundVariants: [{ intent: 'primary', size: 'sm', styles: ['px:2'] }],
});
void _withCompound;
// ─── VariantsConfig type constraint ─────────────────────────────
// defaultVariants must reference valid variant names and values
const _validConfig = {
  base: ['p:4'],
  variants: {
    intent: { primary: ['bg:primary'], secondary: ['bg:secondary'] },
    size: { sm: ['h:8'], md: ['h:10'] },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
};
void _validConfig;
// ─── CSS property on returned function ──────────────────────────
const _cssString = button.css;
void _cssString;
// ─── Empty variants ─────────────────────────────────────────────
const emptyBox = variants({
  base: ['p:4'],
  variants: {},
});
// Should accept no arguments (empty variants means no props)
const _emptyResult = emptyBox();
void _emptyResult;
// Empty object is fine too
const _emptyObj = emptyBox({});
void _emptyObj;
//# sourceMappingURL=variants.test-d.js.map
