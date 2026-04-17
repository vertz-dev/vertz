/**
 * Type-level verification for `token.*`.
 *
 * Without theme augmentation, every dot path types as `TokenPath` — a
 * string-like type that flows into CSS-value positions cleanly. Under
 * `noUncheckedIndexedAccess`, chained bracket access (`token.color.x[500]`)
 * does introduce `| undefined` on the leaf; CSS-value positions accept it
 * because they are optional (`string | number | undefined`).
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
  },
};
void css(vanillaInput);

// ─── Deep chains — under `noUncheckedIndexedAccess`, vanilla users reach
// shades via optional chaining; CSS-value slots accept `undefined`. After
// project augmentation (see `token.ts` jsdoc), `.primary` is narrowed to a
// specific type and `?.` is no longer needed.

const shadedInput: CSSInput = {
  button: {
    color: token.color.primary?.[500],
    '&:hover': {
      backgroundColor: token.color.primary?.[700],
    },
  },
};
void css(shadedInput);
