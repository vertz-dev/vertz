/**
 * Type-level tests for the variants() API.
 *
 * These tests verify that generic type parameters flow correctly
 * through the variant definition and selection pipeline. They are
 * checked by `tsc --noEmit` (typecheck), not by vitest at runtime.
 */

import type { StyleBlock } from '../style-block';
import type { VariantProps, VariantsConfig } from '../variants';
import { variants } from '../variants';
import { token } from '@vertz/ui';

// ─── Basic variant type inference ───────────────────────────────

const button = variants({
  base: { display: 'flex', borderRadius: token.radius.md },
  variants: {
    intent: {
      primary: { backgroundColor: token.color.primary[500] },
      secondary: { backgroundColor: token.color.background },
    },
    size: {
      sm: { height: token.spacing[1] },
      md: { height: token.spacing[4] },
      lg: { height: token.spacing[8] },
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
});

// Valid calls — these should all compile
const _noArgs: string = button();
void _noArgs;

const _withIntent: string = button({ intent: 'primary' });
void _withIntent;

const _withSize: string = button({ size: 'sm' });
void _withSize;

const _withBoth: string = button({ intent: 'secondary', size: 'lg' });
void _withBoth;

// @ts-expect-error - 'danger' is not a valid intent value
const _badIntent: string = button({ intent: 'danger' });
void _badIntent;

// @ts-expect-error - 'xl' is not a valid size value
const _badSize: string = button({ size: 'xl' });
void _badSize;

// @ts-expect-error - 'color' is not a valid variant name
const _badVariant: string = button({ color: 'red' });
void _badVariant;

// ─── VariantProps type extraction ───────────────────────────────

type ButtonVariants = {
  intent: {
    primary: StyleBlock;
    secondary: StyleBlock;
  };
  size: {
    sm: StyleBlock;
    md: StyleBlock;
  };
};

type ButtonProps = VariantProps<ButtonVariants>;

// Valid props
const _validProps: ButtonProps = { intent: 'primary', size: 'sm' };
void _validProps;

// All props are optional
const _emptyProps: ButtonProps = {};
void _emptyProps;

// Partial props
const _partialProps: ButtonProps = { size: 'md' };
void _partialProps;

// @ts-expect-error - 'danger' is not valid for intent
const _invalidProp: ButtonProps = { intent: 'danger' };
void _invalidProp;

// ─── Compound variants type inference ───────────────────────────

const _withCompound = variants({
  base: { borderRadius: token.radius.md },
  variants: {
    intent: {
      primary: { backgroundColor: token.color.primary[500] },
      secondary: { backgroundColor: token.color.background },
    },
    size: {
      sm: { height: token.spacing[1] },
      md: { height: token.spacing[4] },
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
  compoundVariants: [
    { intent: 'primary', size: 'sm', styles: { paddingInline: token.spacing[1] } },
  ],
});
void _withCompound;

// ─── VariantsConfig type constraint ─────────────────────────────

// defaultVariants must reference valid variant names and values
const _validConfig: VariantsConfig<{
  intent: { primary: StyleBlock; secondary: StyleBlock };
  size: { sm: StyleBlock; md: StyleBlock };
}> = {
  base: { padding: token.spacing[4] },
  variants: {
    intent: {
      primary: { backgroundColor: token.color.primary[500] },
      secondary: { backgroundColor: token.color.background },
    },
    size: {
      sm: { height: token.spacing[1] },
      md: { height: token.spacing[4] },
    },
  },
  defaultVariants: { intent: 'primary', size: 'md' },
};
void _validConfig;

// ─── CSS property on returned function ──────────────────────────

const _cssString: string = button.css;
void _cssString;

// ─── Empty variants ─────────────────────────────────────────────

const emptyBox = variants({
  base: { padding: token.spacing[4] },
  variants: {},
});

// Should accept no arguments (empty variants means no props)
const _emptyResult: string = emptyBox();
void _emptyResult;

// Empty object is fine too
const _emptyObj: string = emptyBox({});
void _emptyObj;
