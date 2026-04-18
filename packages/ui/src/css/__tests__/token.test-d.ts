/**
 * Type-level verification for `token.*`.
 *
 * Without theme augmentation, every dot path types as `TokenPath` — a
 * string-like type whose sub-keys come from a finite union of the
 * framework's known scale keys. Chained bracket access (`token.color.x[500]`)
 * stays `TokenPath` (no `| undefined`) even under `noUncheckedIndexedAccess`,
 * because mapped types over a finite key union bypass the widening rule.
 */

import type { CSSInput } from '../css';
import { css } from '../css';
import { token } from '../token';

// ─── Vanilla — top-level namespace access flows into css() ───────

const vanillaInput: CSSInput = {
  panel: {
    backgroundColor: token.color.background,
    color: token.color.foreground,
    fontFamily: token.font.sans,
    padding: token.spacing[4],
    borderRadius: token.radius.md,
    boxShadow: token.shadow.lg,
  },
};
void css(vanillaInput);

// ─── Deep chains — no optional chaining needed under the new design.

const shadedInput: CSSInput = {
  button: {
    color: token.color.primary[500],
    '&:hover': {
      backgroundColor: token.color.primary[700],
    },
  },
};
void css(shadedInput);
